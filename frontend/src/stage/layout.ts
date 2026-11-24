import type { StageType } from "../core/stage";
import { RESPONSIVE_WIDTHS } from "../core/responsive-widths";

export const STAGE_SCHEMA_VERSION = 4;
export const PHONE_STAGE_MAX_INLINE_SIZE = 599;

export type StageVariantName = "default" | "phone";
export type StagePresentationClass = "compact" | "regular" | "wide-short";
export type StageProfile = "mobile" | "standard";
export type StageSlotName = "content" | "controls" | "footer" | "overlay";
export type StageControlRegion = "leading" | "center" | "trailing";
export type StageOverlayRegion =
  "top" | "left" | "media" | "right" | "lower" | "metadata";
export type StageGridRowSize = "content" | "fraction";

export interface StageGridArea {
  readonly column: number;
  readonly columnSpan: number;
  readonly row: number;
  readonly rowSpan: number;
}

export interface StagePlacement {
  readonly grid: StageGridArea;
  readonly node: StageContainerNode | StageModuleNode | StageStackNode;
}

export interface StageContainerNode {
  readonly children: readonly StagePlacement[];
  readonly columns: number;
  readonly id: string;
  readonly kind: "container";
  readonly rows: readonly StageGridRowSize[];
}

export interface StageComponentNode {
  readonly componentType: string;
  readonly config: unknown;
  readonly controlRegion?: StageControlRegion;
  readonly id: string;
  readonly kind: "component";
  readonly overlayRegion?: StageOverlayRegion;
}

export interface StageModuleNode {
  readonly config: unknown;
  readonly id: string;
  readonly kind: "module";
  readonly moduleType: string;
  readonly slots?: Readonly<
    Partial<Record<StageSlotName, readonly StageComponentNode[]>>
  >;
}

export interface StageStackNode {
  readonly children: readonly StageModuleNode[];
  readonly id: string;
  readonly kind: "stack";
}

export interface StageVariant {
  readonly root: StageContainerNode;
}

export interface StageLayoutProfile {
  readonly presentation: StagePresentationClass;
  readonly variantName: StageVariantName;
}

export interface StageDesignDocument {
  readonly id: string;
  readonly name: string;
  readonly profiles: readonly StageProfile[];
  readonly revision: number;
  readonly schemaVersion: typeof STAGE_SCHEMA_VERSION;
  readonly stageType: StageType;
  readonly variants: Readonly<Partial<Record<StageVariantName, StageVariant>>>;
}

export interface StageFlow {
  readonly default: readonly string[];
  readonly phone: readonly string[];
}

export type StageCatalog = ReadonlyMap<string, StageDesignDocument>;

export function stageVariantNameForInlineSize(
  inlineSize: number,
): StageVariantName {
  return inlineSize <= PHONE_STAGE_MAX_INLINE_SIZE ? "phone" : "default";
}

export function stageLayoutProfile(
  inlineSize: number,
  availableBlockSize: number,
): StageLayoutProfile {
  const variantName = stageVariantNameForInlineSize(inlineSize);
  return {
    presentation:
      variantName === "phone"
        ? "compact"
        : availableBlockSize < RESPONSIVE_WIDTHS.narrow
          ? "wide-short"
          : "regular",
    variantName,
  };
}

export function validateStageDesign(value: unknown): StageDesignDocument {
  const source = objectValue(value, "stage");
  if (source.schemaVersion !== STAGE_SCHEMA_VERSION) {
    fail("schema");
  }
  const variants = objectValue(source.variants, "stage.variants");
  const profiles = source.profiles;
  if (
    !Array.isArray(profiles) ||
    profiles.length === 0 ||
    profiles.some(
      (profile) => profile !== "standard" && profile !== "mobile",
    ) ||
    new Set(profiles).size !== profiles.length
  ) {
    fail("profiles");
  }
  const validatedVariants: Partial<Record<StageVariantName, StageVariant>> = {};
  for (const name of ["default", "phone"] as const) {
    if (variants[name] !== undefined) {
      validatedVariants[name] = validateVariant(variants[name], name);
    }
  }
  if (!validatedVariants.default && !validatedVariants.phone) {
    fail("variants.empty");
  }
  return {
    id: nonEmptyString(source.id, "stage.id"),
    name: nonEmptyString(source.name, "stage.name"),
    profiles: profiles as StageProfile[],
    revision: nonNegativeInteger(source.revision, "stage.revision"),
    schemaVersion: STAGE_SCHEMA_VERSION,
    stageType: validateStageType(source.stageType),
    variants: validatedVariants,
  };
}

function validateStageType(value: unknown): StageType {
  if (
    value !== "full" &&
    value !== "camera_only" &&
    value !== "minimal_camera_only"
  ) {
    fail("type");
  }
  return value;
}

export function validateStageCatalog(values: readonly unknown[]): StageCatalog {
  const catalog = new Map<string, StageDesignDocument>();
  for (const value of values) {
    const design = validateStageDesign(value);
    if (catalog.has(design.id)) {
      fail(`catalog.duplicate:${design.id}`);
    }
    catalog.set(design.id, design);
  }
  if (catalog.size === 0) {
    fail("catalog.empty");
  }
  return catalog;
}

export function validateStageFlow(
  value: unknown,
  catalog: StageCatalog,
): StageFlow {
  const source = objectValue(value, "flow");
  return {
    default: validateFlowEntries(source.default, "default", catalog),
    phone: validateFlowEntries(source.phone, "phone", catalog),
  };
}

function validateFlowEntries(
  value: unknown,
  variantName: StageVariantName,
  catalog: StageCatalog,
): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`flow.${variantName}.empty`);
  }
  const ids = value.map((entry) => nonEmptyString(entry, "flow.id"));
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    fail(`flow.${variantName}.duplicate`);
  }
  for (const id of ids) {
    const design = catalog.get(id);
    if (!design) {
      fail(`flow.unknown:${id}`);
    }
    if (
      !design.profiles.includes(variantName === "phone" ? "mobile" : "standard")
    ) {
      fail(`flow.profile:${id}`);
    }
  }
  return ids;
}

function validateVariant(value: unknown, name: StageVariantName): StageVariant {
  const source = objectValue(value, `variant.${name}`);
  const ids = new Set<string>();
  return { root: validateContainer(source.root, ids) };
}

function validateContainer(
  value: unknown,
  ids: Set<string>,
): StageContainerNode {
  const source = objectValue(value, "container");
  const id = uniqueId(source.id, ids);
  if (source.kind !== "container" || !Array.isArray(source.children)) {
    fail(`container:${id}`);
  }
  const columns = positiveInteger(source.columns, "grid.columns");
  const rows = validateRows(source.rows);
  return {
    children: source.children.map((child) =>
      validatePlacement(child, columns, rows.length, ids),
    ),
    columns,
    id,
    kind: "container",
    rows,
  };
}

function validatePlacement(
  value: unknown,
  columns: number,
  rows: number,
  ids: Set<string>,
): StagePlacement {
  const source = objectValue(value, "placement");
  const grid = objectValue(source.grid, "grid");
  const column = positiveInteger(grid.column, "grid.column");
  const columnSpan = positiveInteger(grid.columnSpan, "grid.columnSpan");
  if (column + columnSpan - 1 > columns) {
    fail("grid.column.overflow");
  }
  const row = positiveInteger(grid.row, "grid.row");
  const rowSpan = positiveInteger(grid.rowSpan, "grid.rowSpan");
  if (row + rowSpan - 1 > rows) {
    fail("grid.row.overflow");
  }
  return {
    grid: {
      column,
      columnSpan,
      row,
      rowSpan,
    },
    node: validatePlacementNode(source.node, ids),
  };
}

function validatePlacementNode(
  value: unknown,
  ids: Set<string>,
): StageContainerNode | StageModuleNode | StageStackNode {
  const source = objectValue(value, "placement.node");
  if (source.kind === "container") return validateContainer(source, ids);
  if (source.kind === "module") return validateModule(source, ids);
  if (source.kind !== "stack") {
    fail("placement.kind");
  }
  const id = uniqueId(source.id, ids);
  if (!Array.isArray(source.children) || source.children.length === 0) {
    fail(`stack.empty:${id}`);
  }
  return {
    children: source.children.map((child) => validateModule(child, ids)),
    id,
    kind: "stack",
  };
}

function validateRows(value: unknown): readonly StageGridRowSize[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail("grid.rows.empty");
  }
  return value.map((row) => {
    if (row !== "content" && row !== "fraction") {
      fail("grid.rows.value");
    }
    return row;
  });
}

function validateModule(value: unknown, ids: Set<string>): StageModuleNode {
  const source = objectValue(value, "module");
  const id = uniqueId(source.id, ids);
  if (source.kind !== "module") {
    fail(`module.kind:${id}`);
  }
  const slots =
    source.slots === undefined ? undefined : validateSlots(source.slots, ids);
  return {
    config: source.config,
    id,
    kind: "module",
    moduleType: nonEmptyString(source.moduleType, "module.type"),
    ...(slots ? { slots } : {}),
  };
}

function validateSlots(
  value: unknown,
  ids: Set<string>,
): Partial<Record<StageSlotName, readonly StageComponentNode[]>> {
  const source = objectValue(value, "module.slots");
  const result: Partial<Record<StageSlotName, readonly StageComponentNode[]>> =
    {};
  for (const name of ["content", "controls", "footer", "overlay"] as const) {
    const nodes = source[name];
    if (nodes === undefined) continue;
    if (!Array.isArray(nodes)) {
      fail(`slot:${name}`);
    }
    result[name] = nodes.map((node) => validateComponent(node, ids, name));
  }
  return result;
}

function validateComponent(
  value: unknown,
  ids: Set<string>,
  slot: StageSlotName,
): StageComponentNode {
  const source = objectValue(value, "component");
  const id = uniqueId(source.id, ids);
  if (source.kind !== "component") {
    fail(`component.kind:${id}`);
  }
  const controlRegion = source.controlRegion;
  if (
    controlRegion !== undefined &&
    controlRegion !== "leading" &&
    controlRegion !== "center" &&
    controlRegion !== "trailing"
  ) {
    fail(`control.region:${id}`);
  }
  if (controlRegion !== undefined && slot !== "controls") {
    fail(`control.slot:${id}`);
  }
  const overlayRegion = source.overlayRegion;
  const overlayRegions: readonly StageOverlayRegion[] = [
    "top",
    "left",
    "media",
    "right",
    "lower",
    "metadata",
  ];
  if (
    overlayRegion !== undefined &&
    !overlayRegions.includes(overlayRegion as StageOverlayRegion)
  ) {
    fail(`overlay.region:${id}`);
  }
  if (overlayRegion !== undefined && slot !== "overlay") {
    fail(`overlay.slot:${id}`);
  }
  return {
    componentType: nonEmptyString(source.componentType, "component.type"),
    config: source.config,
    ...(controlRegion ? { controlRegion } : {}),
    id,
    kind: "component",
    ...(overlayRegion
      ? { overlayRegion: overlayRegion as StageOverlayRegion }
      : {}),
  };
}

function uniqueId(value: unknown, ids: Set<string>): string {
  const id = nonEmptyString(value, "node.id");
  if (ids.has(id)) fail(`node.duplicate:${id}`);
  ids.add(id);
  return id;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label}.object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label}.text`);
  }
  return value.trim();
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    fail(`${label}.nonnegative`);
  }
  return value as number;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    fail(`${label}.positive`);
  }
  return value as number;
}

function fail(code: string): never {
  throw new Error(`Invalid Stage: ${code}`);
}
