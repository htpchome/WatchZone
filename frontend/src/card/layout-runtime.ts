import {
  html,
  nothing,
  type ReactiveController,
  type ReactiveControllerHost,
  type TemplateResult,
} from "lit";
import { repeat } from "lit/directives/repeat.js";

import { CameraSessionContext } from "../core/camera-session-context";
import type {
  HomeAssistant,
  HomeAssistantApi,
  HomeAssistantEntity,
} from "../core/home-assistant";
import {
  stageVariantNameForInlineSize,
  validateStageCatalog,
  validateStageFlow,
  type StageCatalog,
  type StageComponentNode,
  type StageFlow,
  type StageModuleNode,
  type StagePlacement,
  type StageSlotName,
  type StageVariantName,
} from "../core/layout";
import { englishLocalize, type LocalizeFunction } from "../core/localization";
import type {
  PlaceableDefinition,
  PlaceablePreparation,
  PlaceableRuntimeContext,
} from "../core/placeable";
import {
  componentLoader,
  moduleLoader,
  type PlaceableLoader,
} from "./placeable-loader";

type PlaceableNode = StageModuleNode | StageComponentNode;

interface PlaceableRecord {
  config?: unknown;
  definition?: PlaceableDefinition<unknown>;
  element?: HTMLElement;
  entityRefs: ReadonlyMap<string, HomeAssistantEntity | undefined>;
  error?: string;
  generation: number;
  node: PlaceableNode;
  preparation?: PlaceablePreparation;
  reserveAspectRatio: boolean;
  status: "error" | "loading" | "ready";
}

/** Owns validated stage rendering, lazy placeable loading, and local failures. */
export class LayoutRuntime implements ReactiveController {
  private _connected = false;
  private readonly _cameraSession = new CameraSessionContext();
  private _context: PlaceableRuntimeContext = {
    cameraSession: this._cameraSession,
  };
  private readonly _activeStageIds: Partial<Record<StageVariantName, string>> =
    {};
  private _catalog?: StageCatalog;
  private _designError?: string;
  private _flow?: StageFlow;
  private _inlineSize = Number.POSITIVE_INFINITY;
  private readonly _records = new Map<string, PlaceableRecord>();
  private _variantName: StageVariantName = "default";

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _moduleLoader: PlaceableLoader = moduleLoader,
    private readonly _componentLoader: PlaceableLoader = componentLoader,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    this._connected = true;
    for (const record of this._records.values()) {
      if (record.status === "loading" && !record.definition) this._load(record);
      else if (record.status === "ready") this._updateRecord(record, true);
    }
  }

  public hostDisconnected(): void {
    this._connected = false;
    for (const record of this._records.values())
      this._releasePreparation(record);
  }

  public hostUpdated(): void {
    for (const record of this._records.values()) {
      if (record.element?.isConnected) this._releasePreparation(record);
    }
  }

  public setInlineSize(inlineSize: number): void {
    if (!Number.isFinite(inlineSize) || inlineSize <= 0) return;
    this._inlineSize = inlineSize;
    const next = stageVariantNameForInlineSize(inlineSize);
    if (next === this._variantName) return;
    this._variantName = next;
    this._syncActiveVariant();
  }

  public setStageSet(designs: readonly unknown[], flow: unknown): void {
    try {
      const catalog = validateStageCatalog(designs);
      const validatedFlow = validateStageFlow(flow, catalog);
      this._catalog = catalog;
      this._flow = validatedFlow;
      this._designError = undefined;
      this._variantName = stageVariantNameForInlineSize(this._inlineSize);
      for (const name of ["default", "phone"] as const) {
        const current = this._activeStageIds[name];
        if (!current || !validatedFlow[name].includes(current)) {
          this._activeStageIds[name] = validatedFlow[name][0];
        }
      }
      this._syncActiveVariant();
    } catch (error) {
      this._catalog = undefined;
      this._flow = undefined;
      this._designError = messageFrom(
        error,
        this._localize("layout.unable_to_load"),
      );
      this._removeMissingRecords(new Set());
      this._host.requestUpdate();
    }
  }

  /** Selects a stage already present in the active responsive flow. */
  public showStage(stageId: string): boolean {
    const flow = this._flow?.[this._variantName];
    if (!flow?.includes(stageId)) return false;
    if (this._activeStageIds[this._variantName] === stageId) return true;
    this._activeStageIds[this._variantName] = stageId;
    this._syncActiveVariant();
    return true;
  }

  public setRuntime(
    hass: HomeAssistant | undefined,
    api: HomeAssistantApi | undefined,
    localize?: LocalizeFunction,
  ): void {
    const transportChanged = this._context.api?.identity !== api?.identity;
    const localeChanged = this._context.localize !== localize;
    this._context = { api, cameraSession: this._cameraSession, hass, localize };
    for (const record of this._records.values()) {
      if (record.status === "ready") {
        this._updateRecord(record, transportChanged || localeChanged);
      }
    }
  }

  public render() {
    if (this._designError) {
      return html`<div class="layout-error" role="alert">
        ${this._designError}
      </div>`;
    }
    const variant = this._activeVariant();
    if (!variant || variant.root.children.length === 0) {
      return html`<div class="layout-empty">
        ${this._localize("layout.no_modules")}
      </div>`;
    }
    const rows = Math.max(
      1,
      ...variant.root.children.map(({ grid }) => grid.row + grid.rowSpan - 1),
    );
    return html`<div
      class="stage-grid"
      data-layout-node=${variant.root.id}
      data-stage-design=${this._activeStageId() ?? nothing}
      data-stage-variant=${this._variantName}
      style=${`--wzc-stage-grid-columns:${variant.root.columns};--wzc-stage-grid-rows:${rows}`}
    >
      ${repeat(
        variant.root.children,
        ({ node }) => node.id,
        (placement) => this._renderPlacement(placement),
      )}
    </div>`;
  }

  private _activeVariant() {
    return this._activeDesign()?.variants[this._variantName];
  }

  private _activeDesign() {
    const id = this._activeStageId();
    return id ? this._catalog?.get(id) : undefined;
  }

  private _activeStageId(): string | undefined {
    return this._activeStageIds[this._variantName];
  }

  private _syncActiveVariant(): void {
    const variant = this._activeVariant();
    if (!variant) {
      this._removeMissingRecords(new Set());
      this._host.requestUpdate();
      return;
    }
    const nodes = collectPlaceables(variant.root.children);
    this._removeMissingRecords(new Set(nodes.map(({ id }) => id)));
    for (const node of nodes) this._syncNode(node);
    this._host.requestUpdate();
  }

  private _renderPlacement(
    placement: StagePlacement,
  ): TemplateResult | typeof nothing {
    const { column, columnSpan, row, rowSpan } = placement.grid;
    const placementStyle = `grid-column:${column}/span ${columnSpan};grid-row:${row}/span ${rowSpan}`;
    const hasComponents = Object.values(placement.node.slots ?? {}).some(
      (components) => components && components.length > 0,
    );
    return hasComponents
      ? this._renderModule(placement.node, placementStyle)
      : this._renderRecord(placement.node, "stage-placement", placementStyle);
  }

  private _renderModule(
    node: StageModuleNode,
    placementStyle: string,
  ): TemplateResult {
    const slotEntries = Object.entries(node.slots ?? {}) as Array<
      [StageSlotName, readonly StageComponentNode[]]
    >;
    return html`<div
      class="stage-placement module-composition has-components"
      style=${placementStyle}
    >
      ${this._renderRecord(node)}
      ${slotEntries.map(
        ([name, components]) =>
          html`<div
            class=${`component-slot component-slot-${name}`}
            data-stage-slot=${name}
          >
            ${repeat(
              components,
              ({ id }) => id,
              (component) => this._renderRecord(component),
            )}
          </div>`,
      )}
    </div>`;
  }

  private _renderRecord(
    node: PlaceableNode,
    extraClass = "",
    style?: string,
  ): TemplateResult | typeof nothing {
    const record = this._records.get(node.id);
    if (!record) return nothing;
    const classes = [
      node.kind === "module" ? "module-slot" : "component-node",
      extraClass,
      `placeable-${record.status}`,
      record.reserveAspectRatio ? "reserve-aspect-ratio" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return html`<div
      class=${classes}
      data-layout-node=${node.id}
      style=${style ?? nothing}
    >
      ${
        record.status === "ready"
          ? record.element
          : record.status === "error"
            ? html`<div class="module-error" role="alert">
                <span>${record.error}</span>
                <button type="button" @click=${() => this._retry(record)}>
                  ${this._localize("common.retry")}
                </button>
              </div>`
            : html`<div class="module-placeholder" role="status">
                ${this._localize("layout.preparing_module")}
              </div>`
      }
    </div>`;
  }

  private _syncNode(node: PlaceableNode): void {
    const existing = this._records.get(node.id);
    if (existing && placeableType(existing.node) === placeableType(node)) {
      existing.node = node;
      if (existing.definition && existing.element) {
        try {
          existing.config = existing.definition.validateConfig(node.config);
          existing.error = undefined;
          existing.status = "ready";
          this._updateRecord(existing, true);
        } catch (error) {
          existing.error = messageFrom(
            error,
            this._localize("layout.invalid_module"),
          );
          existing.status = "error";
        }
      }
      return;
    }
    if (existing) this._removeRecord(existing);
    const loader = this._loaderFor(node);
    const record: PlaceableRecord = {
      entityRefs: new Map(),
      generation: 0,
      node,
      reserveAspectRatio:
        loader.getRegistration(placeableType(node))?.reserveAspectRatio ===
        true,
      status: "loading",
    };
    this._records.set(node.id, record);
    if (this._connected) this._load(record);
  }

  private _load(record: PlaceableRecord, retry = false): void {
    record.status = "loading";
    record.error = undefined;
    const generation = ++record.generation;
    const loader = this._loaderFor(record.node);
    const request = retry
      ? loader.retry(placeableType(record.node))
      : loader.load(placeableType(record.node));
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
              } else record.preparation = preparation;
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
        record.error = messageFrom(
          error,
          this._localize("layout.unable_to_load_module"),
        );
        record.status = "error";
        this._host.requestUpdate();
      });
  }

  private _retry(record: PlaceableRecord): void {
    this._releasePreparation(record);
    record.definition = undefined;
    record.element = undefined;
    record.config = undefined;
    this._load(record, true);
    this._host.requestUpdate();
  }

  private _loaderFor(node: PlaceableNode): PlaceableLoader {
    return node.kind === "module" ? this._moduleLoader : this._componentLoader;
  }

  private _updateRecord(record: PlaceableRecord, force: boolean): void {
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

  private _removeRecord(record: PlaceableRecord): void {
    record.generation += 1;
    this._releasePreparation(record);
    record.element?.remove();
  }

  private _releasePreparation(record: PlaceableRecord): void {
    record.preparation?.release();
    record.preparation = undefined;
  }

  private _isCurrent(record: PlaceableRecord, generation: number): boolean {
    return (
      record.generation === generation &&
      this._records.get(record.node.id) === record
    );
  }

  private _localize(...parameters: Parameters<LocalizeFunction>): string {
    return (this._context.localize ?? englishLocalize)(...parameters);
  }
}

function collectPlaceables(
  placements: readonly StagePlacement[],
): PlaceableNode[] {
  return placements.flatMap(({ node }) => [
    node,
    ...Object.values(node.slots ?? {}).flatMap(
      (components) => components ?? [],
    ),
  ]);
}

function placeableType(node: PlaceableNode): string {
  return node.kind === "module" ? node.moduleType : node.componentType;
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
