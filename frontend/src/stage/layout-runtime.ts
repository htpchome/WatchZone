import {
  html,
  nothing,
  type ReactiveController,
  type ReactiveControllerHost,
  type TemplateResult,
} from "lit";
import { repeat } from "lit/directives/repeat.js";

import { CameraSessionContext } from "./camera-session-context";
import { CameraSelectionContext } from "./camera-selection-context";
import { ActivityFilterContext } from "./activity/activity-filter-context";
import {
  CAMERA_NAVIGATION_COMPONENT_TYPE,
  REVIEWS_MODULE_TYPE,
  EVENTS_MODULE_TYPE,
  RECORDINGS_MODULE_TYPE,
} from "../core/constants";
import { MediaDateContext } from "./media-date-context";
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
  type StageControlRegion,
  type StageFlow,
  type StageModuleNode,
  type StagePlacement,
  type StageSlotName,
  type StageStackNode,
  type StageVariantName,
} from "./layout";
import { englishLocalize, type LocalizeFunction } from "../core/localization";
import type {
  PlaceableDefinition,
  PlaceablePreparation,
  PlaceableRuntimeContext,
} from "./placeable";

let activityControlsDefinition: Promise<unknown> | undefined;

function defineActivityControls(): Promise<unknown> {
  return (activityControlsDefinition ??= import("./activity"));
}
import {
  componentLoader,
  moduleLoader,
  type PlaceableLoader,
} from "./placeable-loader";
import { isIconName, renderIcon } from "../ui/icons";

type PlaceableNode = StageModuleNode | StageComponentNode;

interface PlaceableRecord {
  config?: unknown;
  definition?: PlaceableDefinition<unknown>;
  element?: HTMLElement;
  entityRefs: ReadonlyMap<string, HomeAssistantEntity | undefined>;
  generation: number;
  node: PlaceableNode;
  placeholder?: "activity" | "camera" | "camera-navigation";
  preparation?: PlaceablePreparation;
  status: "error" | "idle" | "loading" | "ready";
  visible: boolean;
}

/** Owns validated stage rendering, lazy placeable loading, and local failures. */
export class LayoutRuntime implements ReactiveController {
  private readonly _activityFilter = new ActivityFilterContext();
  private _connected = false;
  private readonly _cameraSelection = new CameraSelectionContext();
  private readonly _cameraSession = new CameraSessionContext();
  private readonly _mediaDate = new MediaDateContext();
  private _context: Omit<PlaceableRuntimeContext, "placeableId"> = {
    activityFilter: this._activityFilter,
    cameraSelection: this._cameraSelection,
    cameraSession: this._cameraSession,
    mediaDate: this._mediaDate,
  };
  private readonly _activeStageIds: Partial<Record<StageVariantName, string>> =
    {};
  private _catalog?: StageCatalog;
  private _designError?: string;
  private _flow?: StageFlow;
  private _inlineSize = Number.POSITIVE_INFINITY;
  private readonly _records = new Map<string, PlaceableRecord>();
  private readonly _activeStackModules = new Map<string, string>();
  private _variantName: StageVariantName = "default";

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _moduleLoader: PlaceableLoader = moduleLoader,
    private readonly _componentLoader: PlaceableLoader = componentLoader,
    private readonly _showError?: (message: string, key: string) => void,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    this._connected = true;
    for (const record of this._records.values()) {
      if (record.visible && record.status !== "ready" && !record.definition)
        this._load(record);
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
      this._showError?.(
        this._localize("layout.unable_to_load"),
        "layout-stage",
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
    this._context = {
      activityFilter: this._activityFilter,
      api,
      cameraSelection: this._cameraSelection,
      cameraSession: this._cameraSession,
      mediaDate: this._mediaDate,
      hass,
      localize,
    };
    for (const record of this._records.values()) {
      if (record.status === "ready") {
        this._updateRecord(record, transportChanged || localeChanged);
      }
    }
  }

  public render() {
    if (this._designError) {
      return nothing;
    }
    const variant = this._activeVariant();
    if (!variant || variant.root.children.length === 0) {
      return html`<div class="layout-empty">
        ${this._localize("layout.no_modules")}
      </div>`;
    }
    const rows = variant.root.rows
      .map((size) => (size === "content" ? "max-content" : "minmax(0,1fr)"))
      .join(" ");
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
    const nodes = collectPlaceables(
      variant.root.children,
      this._activeStackModules,
    );
    this._removeMissingRecords(new Set(nodes.map(({ node }) => node.id)));
    for (const { node, visible } of nodes) this._syncNode(node, visible);
    this._host.requestUpdate();
  }

  private _renderPlacement(
    placement: StagePlacement,
  ): TemplateResult | typeof nothing {
    const { column, columnSpan, row, rowSpan } = placement.grid;
    const placementStyle = `grid-column:${column}/span ${columnSpan};grid-row:${row}/span ${rowSpan}`;
    if (placement.node.kind === "stack") {
      return this._renderStack(placement.node, placementStyle);
    }
    const hasComponents = Object.values(placement.node.slots ?? {}).some(
      (components) => components && components.length > 0,
    );
    return hasComponents
      ? this._renderModule(placement.node, placementStyle)
      : this._renderRecord(placement.node, "stage-placement", placementStyle);
  }

  private _renderStack(
    node: StageStackNode,
    placementStyle: string,
  ): TemplateResult {
    const activeId =
      this._activeStackModules.get(node.id) ?? node.children[0]?.id;
    const active = node.children.find(({ id }) => id === activeId);
    const activityUnderlay = node.children.some(({ moduleType }) =>
      [
        REVIEWS_MODULE_TYPE,
        EVENTS_MODULE_TYPE,
        RECORDINGS_MODULE_TYPE,
      ].includes(moduleType),
    );
    return html`<div
      class=${`stage-placement stage-stack${activityUnderlay ? " activity-underlay-stack" : ""}`}
      data-layout-node=${node.id}
      style=${placementStyle}
    >
      ${
        activityUnderlay
          ? html`<div class="activity-underlay-cover" aria-hidden="true"></div>`
          : nothing
      }
      <nav
        class="stage-stack-navigation"
        aria-label=${this._localize("navigation.activity")}
      >
        ${repeat(
          node.children,
          ({ id }) => id,
          (child) => {
            const navigation = this._moduleLoader.getRegistration(
              child.moduleType,
            )?.navigation;
            const label = navigation
              ? this._localize(navigation.labelKey)
              : child.moduleType;
            return html`<button
              class=${`round-button stage-stack-button${
                child.id === activeId ? " active" : ""
              }`}
              type="button"
              aria-label=${label}
              aria-pressed=${child.id === activeId ? "true" : "false"}
              title=${label}
              @pointerenter=${this._handleStackButtonPointerEnter}
              @pointerleave=${this._handleStackButtonPointerLeave}
              @pointerdown=${this._handleStackButtonPointerDown}
              @click=${() => this._showStackModule(node, child.id)}
            >
              ${
                navigation && isIconName(navigation.icon)
                  ? renderIcon(navigation.icon)
                  : label
              }
            </button>`;
          },
        )}
        ${this._renderActivityFilters(node, active)}
      </nav>
      <div class="stage-stack-content">
        ${active ? this._renderStackModule(active) : nothing}
      </div>
    </div>`;
  }

  private _renderActivityFilters(
    node: StageStackNode,
    active: StageModuleNode | undefined,
  ): TemplateResult | typeof nothing {
    const reviews = node.children.find(
      ({ moduleType }) => moduleType === REVIEWS_MODULE_TYPE,
    );
    const hasEvents = node.children.some(
      ({ moduleType }) => moduleType === EVENTS_MODULE_TYPE,
    );
    if (
      !reviews ||
      !hasEvents ||
      !isActivityConfig(reviews.config) ||
      !active
    ) {
      return nothing;
    }
    const activity =
      active.moduleType === REVIEWS_MODULE_TYPE ||
      active.moduleType === EVENTS_MODULE_TYPE;
    const recordings = active.moduleType === RECORDINGS_MODULE_TYPE;
    if (!activity && !recordings) return nothing;
    const targetModuleId = isTargetModuleConfig(active.config)
      ? active.config.targetModuleId
      : reviews.config.targetModuleId;
    void defineActivityControls();
    return html`<wzc-activity-filter
        .api=${this._context.api}
        .cameraSelection=${this._cameraSelection}
        .disabled=${recordings}
        .filterContext=${this._activityFilter}
        .historyDays=${reviews.config.historyDays}
        .localize=${this._context.localize ?? englishLocalize}
        .targetModuleId=${reviews.config.targetModuleId}
      ></wzc-activity-filter>
      <wzc-activity-calendar
        .api=${this._context.api}
        .cameraSelection=${this._cameraSelection}
        .dateContext=${this._mediaDate}
        .historyDays=${reviews.config.historyDays}
        .localize=${this._context.localize ?? englishLocalize}
        .mode=${recordings ? "recordings" : "activity"}
        .targetModuleId=${targetModuleId}
      ></wzc-activity-calendar>`;
  }

  private _renderStackModule(
    node: StageModuleNode,
  ): TemplateResult | typeof nothing {
    const hasComponents = Object.values(node.slots ?? {}).some(
      (components) => components && components.length > 0,
    );
    return hasComponents
      ? this._renderModule(node, "")
      : this._renderRecord(node, "stage-stack-module");
  }

  private _showStackModule(node: StageStackNode, moduleId: string): void {
    if (!node.children.some(({ id }) => id === moduleId)) return;
    if (this._activeStackModules.get(node.id) === moduleId) return;
    this._activeStackModules.set(node.id, moduleId);
    this._syncActiveVariant();
  }

  private readonly _handleStackButtonPointerEnter = (
    event: PointerEvent,
  ): void => {
    if (event.pointerType !== "mouse") return;
    (event.currentTarget as HTMLElement).classList.add("hovered");
  };

  private readonly _handleStackButtonPointerLeave = (
    event: PointerEvent,
  ): void => {
    (event.currentTarget as HTMLElement).classList.remove("hovered");
  };

  private readonly _handleStackButtonPointerDown = (
    event: PointerEvent,
  ): void => {
    if (event.pointerType === "mouse") return;
    (event.currentTarget as HTMLElement).classList.remove("hovered");
  };

  private _renderModule(
    node: StageModuleNode,
    placementStyle: string,
  ): TemplateResult {
    const slotEntries = Object.entries(node.slots ?? {}) as Array<
      [StageSlotName, readonly StageComponentNode[]]
    >;
    const cameraNavigation = Object.values(node.slots ?? {}).some(
      (components) =>
        components?.some(
          ({ componentType }) =>
            componentType === CAMERA_NAVIGATION_COMPONENT_TYPE,
        ),
    );
    return html`<div
      class=${`stage-placement module-composition has-components${cameraNavigation ? " stage-camera-navigation" : ""}`}
      style=${placementStyle}
    >
      ${this._renderRecord(node)}
      ${slotEntries.map(([name, components]) =>
        this._renderComponentSlot(name, components),
      )}
    </div>`;
  }

  private _renderComponentSlot(
    name: StageSlotName,
    components: readonly StageComponentNode[],
  ): TemplateResult {
    return html`<div
      class=${`component-slot component-slot-${name}`}
      data-stage-slot=${name}
    >
      ${
        name === "controls"
          ? (["leading", "center", "trailing"] as const).map((region) =>
              this._renderControlRegion(region, components),
            )
          : repeat(
              components,
              ({ id }) => id,
              (component) =>
                this._renderRecord(
                  component,
                  name === "overlay"
                    ? `overlay-region-${component.overlayRegion ?? "center"}`
                    : "",
                ),
            )
      }
    </div>`;
  }

  private _renderControlRegion(
    region: StageControlRegion,
    components: readonly StageComponentNode[],
  ): TemplateResult {
    const controls = components.filter(
      ({ controlRegion }) => (controlRegion ?? "center") === region,
    );
    return html`<div
      class=${`control-region control-region-${region}`}
      data-control-region=${region}
    >
      ${repeat(
        controls,
        ({ id }) => id,
        (component) => this._renderRecord(component),
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
      record.placeholder ? `placeholder-${record.placeholder}` : "",
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
          : record.status === "loading"
            ? this._renderPlaceholder(record)
            : nothing
      }
    </div>`;
  }

  private _syncNode(node: PlaceableNode, visible: boolean): void {
    const existing = this._records.get(node.id);
    if (existing && placeableType(existing.node) === placeableType(node)) {
      existing.node = node;
      const becameVisible = visible && !existing.visible;
      existing.visible = visible;
      if (existing.definition && existing.element) {
        try {
          existing.config = existing.definition.validateConfig(node.config);
          existing.status = "ready";
          this._updateRecord(existing, true);
        } catch {
          this._showError?.(
            this._localize("layout.invalid_module"),
            `layout-placeable-${node.id}`,
          );
          existing.status = "error";
        }
      } else if (visible && (existing.status === "error" || becameVisible)) {
        this._load(existing, true);
      }
      return;
    }
    if (existing) this._removeRecord(existing);
    const loader = this._loaderFor(node);
    const registration = loader.getRegistration(placeableType(node));
    const record: PlaceableRecord = {
      entityRefs: new Map(),
      generation: 0,
      node,
      placeholder: registration?.placeholder,
      status: visible ? "loading" : "idle",
      visible,
    };
    this._records.set(node.id, record);
    if (this._connected && visible) this._load(record);
  }

  private _renderPlaceholder(record: PlaceableRecord): TemplateResult {
    const config =
      typeof record.node.config === "object" && record.node.config !== null
        ? (record.node.config as Record<string, unknown>)
        : {};
    const status = html`<span class="visually-hidden">
      ${this._localize("layout.preparing_module")}
    </span>`;
    if (record.placeholder === "activity") {
      return html`<div
        class=${[
          "module-placeholder",
          "activity-skeleton",
          config.shadows === false ? "no-shadows" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="status"
      >
        ${status}
        ${Array.from(
          { length: 5 },
          () => html`<span class="activity-skeleton-row"></span>`,
        )}
      </div>`;
    }
    if (record.placeholder === "camera-navigation") {
      return html`<div
        class=${[
          "module-placeholder",
          "camera-navigation-skeleton",
          config.roundedCorners === false ? "square" : "rounded",
          config.shadows === false ? "no-shadows" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="status"
      >
        ${status}
        ${Array.from(
          { length: 4 },
          () => html`<span class="camera-navigation-skeleton-item"></span>`,
        )}
      </div>`;
    }
    return html`<div class="module-placeholder" role="status">
      ${this._localize("layout.preparing_module")}
    </div>`;
  }

  private _load(record: PlaceableRecord, retry = false): void {
    record.status = "loading";
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
            .prepare(config, this._runtimeContext(record))
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
      .catch(() => {
        if (!this._isCurrent(record, generation)) return;
        this._releasePreparation(record);
        this._showError?.(
          this._localize("layout.unable_to_load_module"),
          `layout-placeable-${record.node.id}`,
        );
        record.status = "error";
        this._host.requestUpdate();
      });
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
    definition.updateElement(element, config, this._runtimeContext(record));
  }

  private _runtimeContext(record: PlaceableRecord): PlaceableRuntimeContext {
    return { ...this._context, placeableId: record.node.id };
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
  activeStackModules: Map<string, string>,
): Array<{ readonly node: PlaceableNode; readonly visible: boolean }> {
  return placements.flatMap(({ node }) => {
    if (node.kind === "module") return modulePlaceables(node, true);
    const current = activeStackModules.get(node.id);
    const active = node.children.some(({ id }) => id === current)
      ? current
      : node.children[0]?.id;
    if (active) activeStackModules.set(node.id, active);
    return node.children.flatMap((child) =>
      modulePlaceables(child, child.id === active),
    );
  });
}

function modulePlaceables(
  node: StageModuleNode,
  visible: boolean,
): Array<{ readonly node: PlaceableNode; readonly visible: boolean }> {
  return [
    { node, visible },
    ...Object.values(node.slots ?? {}).flatMap((components) =>
      (components ?? []).map((component) => ({
        node: component,
        visible,
      })),
    ),
  ];
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

function isActivityConfig(
  value: unknown,
): value is { readonly historyDays: number; readonly targetModuleId: string } {
  if (typeof value !== "object" || value === null) return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config.historyDays === "number" &&
    typeof config.targetModuleId === "string" &&
    config.targetModuleId.length > 0
  );
}

function isTargetModuleConfig(
  value: unknown,
): value is { readonly targetModuleId: string } {
  if (typeof value !== "object" || value === null) return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config.targetModuleId === "string" &&
    config.targetModuleId.length > 0
  );
}
