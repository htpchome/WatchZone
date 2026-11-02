import {
  html,
  nothing,
  type ReactiveController,
  type ReactiveControllerHost,
  type TemplateResult,
} from "lit";
import { repeat } from "lit/directives/repeat.js";

import type {
  HomeAssistant,
  HomeAssistantApi,
  HomeAssistantEntity,
} from "../core/home-assistant";
import type {
  LayoutContainerNode,
  LayoutDocument,
  LayoutModuleNode,
  LayoutNode,
} from "../core/layout";
import { validateLayoutDocument } from "../core/layout";
import type {
  ModuleDefinition,
  ModulePreparation,
  ModuleRuntimeContext,
} from "../core/module";
import { moduleLoader, type ModuleLoader } from "./module-loader";

interface ModuleRecord {
  config?: unknown;
  definition?: ModuleDefinition<unknown>;
  element?: HTMLElement;
  entityRefs: ReadonlyMap<string, HomeAssistantEntity | undefined>;
  error?: string;
  generation: number;
  node: LayoutModuleNode;
  preparation?: ModulePreparation;
  reserveAspectRatio: boolean;
  status: "error" | "loading" | "ready";
}

/** Owns validated layout rendering, lazy module loading, and local failures. */
export class LayoutRuntime implements ReactiveController {
  private _connected = false;
  private _context: ModuleRuntimeContext = {};
  private _layout?: LayoutDocument;
  private _layoutError?: string;
  private readonly _records = new Map<string, ModuleRecord>();

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _loader: ModuleLoader = moduleLoader,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    this._connected = true;
    for (const record of this._records.values()) {
      if (record.status === "loading" && !record.definition) {
        this._load(record);
      } else if (record.status === "ready") {
        this._updateRecord(record, true);
      }
    }
  }

  public hostDisconnected(): void {
    this._connected = false;
    for (const record of this._records.values()) {
      this._releasePreparation(record);
    }
  }

  public hostUpdated(): void {
    for (const record of this._records.values()) {
      if (record.element?.isConnected) this._releasePreparation(record);
    }
  }

  public setLayout(value: unknown): void {
    let layout: LayoutDocument;
    try {
      layout = validateLayoutDocument(value);
    } catch (error) {
      this._layout = undefined;
      this._layoutError = messageFrom(error, "Unable to load this layout.");
      this._removeMissingRecords(new Set());
      this._host.requestUpdate();
      return;
    }
    this._layout = layout;
    this._layoutError = undefined;
    const nodes = collectModuleNodes(layout.root);
    this._removeMissingRecords(new Set(nodes.map(({ id }) => id)));
    for (const node of nodes) this._syncNode(node);
    this._host.requestUpdate();
  }

  public setRuntime(
    hass: HomeAssistant | undefined,
    api: HomeAssistantApi | undefined,
  ): void {
    const transportChanged = this._context.api?.identity !== api?.identity;
    this._context = { api, hass };
    for (const record of this._records.values()) {
      if (record.status === "ready") {
        this._updateRecord(record, transportChanged);
      }
    }
  }

  public render() {
    if (this._layoutError) {
      return html`<div class="layout-error" role="alert">
        ${this._layoutError}
      </div>`;
    }
    if (!this._layout || this._layout.root.children.length === 0) {
      return html`<div class="layout-empty">No modules are configured.</div>`;
    }
    return this._renderContainer(this._layout.root, true);
  }

  private _renderContainer(
    node: LayoutContainerNode,
    root = false,
  ): TemplateResult {
    return html`<div
      class=${[
        "layout-container",
        root ? "layout-root" : "",
        node.children.length === 1 ? "single-child" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-layout-node=${node.id}
    >
      ${repeat(
        node.children,
        (child) => child.id,
        (child) => this._renderNode(child),
      )}
    </div>`;
  }

  private _renderNode(node: LayoutNode): TemplateResult | typeof nothing {
    if (node.kind === "container") return this._renderContainer(node);
    const record = this._records.get(node.id);
    if (!record) return nothing;
    const classes = [
      "module-slot",
      `module-${record.status}`,
      record.reserveAspectRatio ? "reserve-aspect-ratio" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return html`<div class=${classes} data-layout-node=${node.id}>
      ${
        record.status === "ready"
          ? record.element
          : record.status === "error"
            ? html`<div class="module-error" role="alert">
                <span>${record.error}</span>
                <button type="button" @click=${() => this._retry(record)}>
                  Retry
                </button>
              </div>`
            : html`<div class="module-placeholder" role="status">
                Preparing module…
              </div>`
      }
    </div>`;
  }

  private _syncNode(node: LayoutModuleNode): void {
    const existing = this._records.get(node.id);
    if (existing && existing.node.moduleType === node.moduleType) {
      existing.node = node;
      if (existing.definition && existing.element) {
        try {
          existing.config = existing.definition.validateConfig(node.config);
          existing.error = undefined;
          existing.status = "ready";
          this._updateRecord(existing, true);
        } catch (error) {
          existing.error = messageFrom(error, "Invalid module configuration.");
          existing.status = "error";
        }
      }
      return;
    }
    if (existing) this._removeRecord(existing);
    const record: ModuleRecord = {
      entityRefs: new Map(),
      generation: 0,
      node,
      reserveAspectRatio:
        this._loader.getRegistration(node.moduleType)?.reserveAspectRatio ===
        true,
      status: "loading",
    };
    this._records.set(node.id, record);
    if (this._connected) this._load(record);
  }

  private _load(record: ModuleRecord, retry = false): void {
    record.status = "loading";
    record.error = undefined;
    const generation = ++record.generation;
    const request = retry
      ? this._loader.retry(record.node.moduleType)
      : this._loader.load(record.node.moduleType);
    void request
      .then(async (definition) => {
        if (!this._isCurrent(record, generation)) return;
        const config = definition.validateConfig(record.node.config);
        record.definition = definition;
        record.config = config;
        if (this._connected && definition.prepare) {
          void definition
            .prepare(config, this._context)
            .then((preparation) => {
              if (
                !this._isCurrent(record, generation) ||
                !this._connected ||
                record.status === "error" ||
                record.element?.isConnected
              ) {
                preparation?.release();
              } else {
                record.preparation = preparation;
              }
            })
            .catch(() => undefined);
        }
        await definition.define();
        if (!this._isCurrent(record, generation)) return;
        record.element = definition.createElement();
        record.status = "ready";
        this._updateRecord(record, true);
        this._host.requestUpdate();
      })
      .catch((error: unknown) => {
        if (!this._isCurrent(record, generation)) return;
        this._releasePreparation(record);
        record.error = messageFrom(error, "Unable to load this module.");
        record.status = "error";
        this._host.requestUpdate();
      });
  }

  private _retry(record: ModuleRecord): void {
    this._releasePreparation(record);
    record.definition = undefined;
    record.element = undefined;
    record.config = undefined;
    this._load(record, true);
    this._host.requestUpdate();
  }

  private _updateRecord(record: ModuleRecord, force: boolean): void {
    const { definition, element, config } = record;
    if (!definition || !element || config === undefined) return;
    const ids = definition.getEntityIds(config);
    const nextRefs = new Map(
      ids.map((id) => [id, this._context.hass?.states[id]] as const),
    );
    if (!force && sameEntityRefs(record.entityRefs, nextRefs)) return;
    record.entityRefs = nextRefs;
    definition.updateElement(element, config, this._context);
  }

  private _removeMissingRecords(ids: ReadonlySet<string>): void {
    for (const [id, record] of this._records) {
      if (ids.has(id)) continue;
      this._removeRecord(record);
      this._records.delete(id);
    }
  }

  private _removeRecord(record: ModuleRecord): void {
    record.generation += 1;
    this._releasePreparation(record);
    record.element?.remove();
  }

  private _releasePreparation(record: ModuleRecord): void {
    record.preparation?.release();
    record.preparation = undefined;
  }

  private _isCurrent(record: ModuleRecord, generation: number): boolean {
    return (
      record.generation === generation &&
      this._records.get(record.node.id) === record
    );
  }
}

function collectModuleNodes(node: LayoutNode): LayoutModuleNode[] {
  if (node.kind === "module") return [node];
  return node.children.flatMap((child) => collectModuleNodes(child));
}

function sameEntityRefs(
  current: ReadonlyMap<string, HomeAssistantEntity | undefined>,
  next: ReadonlyMap<string, HomeAssistantEntity | undefined>,
): boolean {
  if (current.size !== next.size) return false;
  for (const [id, entity] of next) {
    if (current.get(id) !== entity) return false;
  }
  return true;
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
