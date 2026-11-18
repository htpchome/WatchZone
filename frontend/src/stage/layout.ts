import type { StageType } from "../core/stage";

export const STAGE_SCHEMA_VERSION = 3;
export const PHONE_STAGE_MAX_INLINE_SIZE = 599;

export type StageVariantName = "default" | "phone";
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
  readonly node: StageModuleNode | StageStackNode;
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

export function validateStageDesign(value: unknown): StageDesignDocument {
  const source = objectValue(value, "Stage designs");
  if (source.schemaVersion !== STAGE_SCHEMA_VERSION) {
    throw new Error("Bad Stage schema.");
  }
  const variants = objectValue(source.variants, "Stage design variants");
  const profiles = source.profiles;
  if (
    !Array.isArray(profiles) ||
    profiles.length === 0 ||
    profiles.some(
      (profile) => profile !== "standard" && profile !== "mobile",
    ) ||
    new Set(profiles).size !== profiles.length
  ) {
    throw new Error("Invalid profiles.");
  }
  const validatedVariants: Partial<Record<StageVariantName, StageVariant>> = {};
  for (const name of ["default", "phone"] as const) {
    if (variants[name] !== undefined) {
      validatedVariants[name] = validateVariant(variants[name], name);
    }
  }
  if (!validatedVariants.default && !validatedVariants.phone) {
    throw new Error("Variant required.");
  }
  return {
    id: nonEmptyString(source.id, "Stage design IDs"),
    name: nonEmptyString(source.name, "Stage design names"),
    profiles: profiles as StageProfile[],
    revision: nonNegativeInteger(source.revision, "Stage design revisions"),
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
    throw new Error("Invalid Stage type.");
  }
  return value;
}

export function validateStageCatalog(values: readonly unknown[]): StageCatalog {
  const catalog = new Map<string, StageDesignDocument>();
  for (const value of values) {
    const design = validateStageDesign(value);
    if (catalog.has(design.id)) {
      throw new Error(`Duplicate Stage ID "${design.id}".`);
    }
    catalog.set(design.id, design);
  }
  if (catalog.size === 0) {
    throw new Error("Empty Stage catalog.");
  }
  return catalog;
}

export function validateStageFlow(
  value: unknown,
  catalog: StageCatalog,
): StageFlow {
  const source = objectValue(value, "Stage flows");
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
    throw new Error(`${variantName} Stage flow is empty.`);
  }
  const ids = value.map((entry) => nonEmptyString(entry, "Stage flow IDs"));
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new Error(`Duplicate IDs in ${variantName} Stage flow.`);
  }
  for (const id of ids) {
    const design = catalog.get(id);
    if (!design) {
      throw new Error(`Unknown Stage "${id}".`);
    }
    if (
      !design.profiles.includes(variantName === "phone" ? "mobile" : "standard")
    ) {
      throw new Error(`Ineligible "${id}".`);
    }
  }
  return ids;
}

function validateVariant(value: unknown, name: StageVariantName): StageVariant {
  const source = objectValue(value, `Stage variant "${name}"`);
  const ids = new Set<string>();
  return { root: validateContainer(source.root, ids) };
}

function validateContainer(
  value: unknown,
  ids: Set<string>,
): StageContainerNode {
  const source = objectValue(value, "Stage containers");
  const id = uniqueId(source.id, ids);
  if (source.kind !== "container" || !Array.isArray(source.children)) {
    throw new Error(`Bad Stage container "${id}".`);
  }
  const columns = positiveInteger(source.columns, "Stage grid columns");
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
  const source = objectValue(value, "Stage placements");
  const grid = objectValue(source.grid, "Stage grid areas");
  const column = positiveInteger(grid.column, "Stage grid columns");
  const columnSpan = positiveInteger(grid.columnSpan, "Stage column spans");
  if (column + columnSpan - 1 > columns) {
    throw new Error("Stage exceeds columns.");
  }
  const row = positiveInteger(grid.row, "Stage grid rows");
  const rowSpan = positiveInteger(grid.rowSpan, "Stage row spans");
  if (row + rowSpan - 1 > rows) {
    throw new Error("Stage exceeds rows.");
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
): StageModuleNode | StageStackNode {
  const source = objectValue(value, "Stage placement nodes");
  if (source.kind === "module") return validateModule(source, ids);
  if (source.kind !== "stack") {
    throw new Error("Bad Stage placement.");
  }
  const id = uniqueId(source.id, ids);
  if (!Array.isArray(source.children) || source.children.length === 0) {
    throw new Error(`Empty Stage stack "${id}".`);
  }
  return {
    children: source.children.map((child) => validateModule(child, ids)),
    id,
    kind: "stack",
  };
}

function validateRows(value: unknown): readonly StageGridRowSize[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Stage row required.");
  }
  return value.map((row) => {
    if (row !== "content" && row !== "fraction") {
      throw new Error("Bad Stage row size.");
    }
    return row;
  });
}

function validateModule(value: unknown, ids: Set<string>): StageModuleNode {
  const source = objectValue(value, "Stage modules");
  const id = uniqueId(source.id, ids);
  if (source.kind !== "module") {
    throw new Error(`Stage node "${id}" is not a module.`);
  }
  const slots =
    source.slots === undefined ? undefined : validateSlots(source.slots, ids);
  return {
    config: source.config,
    id,
    kind: "module",
    moduleType: nonEmptyString(source.moduleType, "Module types"),
    ...(slots ? { slots } : {}),
  };
}

function validateSlots(
  value: unknown,
  ids: Set<string>,
): Partial<Record<StageSlotName, readonly StageComponentNode[]>> {
  const source = objectValue(value, "Module slots");
  const result: Partial<Record<StageSlotName, readonly StageComponentNode[]>> =
    {};
  for (const name of ["content", "controls", "footer", "overlay"] as const) {
    const nodes = source[name];
    if (nodes === undefined) continue;
    if (!Array.isArray(nodes)) {
      throw new Error(`Invalid Stage slot "${name}".`);
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
  const source = objectValue(value, "Stage components");
  const id = uniqueId(source.id, ids);
  if (source.kind !== "component") {
    throw new Error(`Stage node "${id}" is not a component.`);
  }
  const controlRegion = source.controlRegion;
  if (
    controlRegion !== undefined &&
    controlRegion !== "leading" &&
    controlRegion !== "center" &&
    controlRegion !== "trailing"
  ) {
    throw new Error(`Bad control region on "${id}".`);
  }
  if (controlRegion !== undefined && slot !== "controls") {
    throw new Error(`Misplaced control region on "${id}".`);
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
    throw new Error(`Bad overlay region on "${id}".`);
  }
  if (overlayRegion !== undefined && slot !== "overlay") {
    throw new Error(`Misplaced overlay region on "${id}".`);
  }
  return {
    componentType: nonEmptyString(source.componentType, "Component types"),
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
  const id = nonEmptyString(value, "Stage node IDs");
  if (ids.has(id)) throw new Error(`Duplicate node "${id}".`);
  ids.add(id);
  return id;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}: object required.`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label}: text required.`);
  }
  return value.trim();
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label}: nonnegative integer required.`);
  }
  return value as number;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${label}: positive integer required.`);
  }
  return value as number;
}
