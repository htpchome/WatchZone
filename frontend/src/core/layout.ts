export const STAGE_SCHEMA_VERSION = 1;
export const PHONE_STAGE_MAX_INLINE_SIZE = 599;

export type StageVariantName = "default" | "phone";
export type StageSlotName = "content" | "controls" | "footer" | "overlay";

export interface StageGridArea {
  readonly column: number;
  readonly columnSpan: number;
  readonly row: number;
  readonly rowSpan: number;
}

export interface StagePlacement {
  readonly grid: StageGridArea;
  readonly node: StageModuleNode;
}

export interface StageContainerNode {
  readonly children: readonly StagePlacement[];
  readonly columns: number;
  readonly id: string;
  readonly kind: "container";
}

export interface StageComponentNode {
  readonly componentType: string;
  readonly config: unknown;
  readonly id: string;
  readonly kind: "component";
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

export interface StageVariant {
  readonly root: StageContainerNode;
}

export interface StageDesignDocument {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly schemaVersion: typeof STAGE_SCHEMA_VERSION;
  readonly variants: Readonly<Record<StageVariantName, StageVariant>>;
}

export function selectStageVariant(
  design: StageDesignDocument,
  inlineSize: number,
): StageVariant {
  return inlineSize <= PHONE_STAGE_MAX_INLINE_SIZE
    ? design.variants.phone
    : design.variants.default;
}

export function validateStageDesign(value: unknown): StageDesignDocument {
  const source = objectValue(value, "Stage designs");
  if (source.schemaVersion !== STAGE_SCHEMA_VERSION) {
    throw new Error("The stage design uses an unsupported schema version.");
  }
  const variants = objectValue(source.variants, "Stage design variants");
  return {
    id: nonEmptyString(source.id, "Stage design IDs"),
    name: nonEmptyString(source.name, "Stage design names"),
    revision: nonNegativeInteger(source.revision, "Stage design revisions"),
    schemaVersion: STAGE_SCHEMA_VERSION,
    variants: {
      default: validateVariant(variants.default, "default"),
      phone: validateVariant(variants.phone, "phone"),
    },
  };
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
    throw new Error(`Stage container "${id}" is invalid.`);
  }
  const columns = positiveInteger(source.columns, "Stage grid columns");
  return {
    children: source.children.map((child) =>
      validatePlacement(child, columns, ids),
    ),
    columns,
    id,
    kind: "container",
  };
}

function validatePlacement(
  value: unknown,
  columns: number,
  ids: Set<string>,
): StagePlacement {
  const source = objectValue(value, "Stage placements");
  const grid = objectValue(source.grid, "Stage grid areas");
  const column = positiveInteger(grid.column, "Stage grid columns");
  const columnSpan = positiveInteger(grid.columnSpan, "Stage column spans");
  if (column + columnSpan - 1 > columns) {
    throw new Error("A stage placement exceeds its container columns.");
  }
  return {
    grid: {
      column,
      columnSpan,
      row: positiveInteger(grid.row, "Stage grid rows"),
      rowSpan: positiveInteger(grid.rowSpan, "Stage row spans"),
    },
    node: validateModule(source.node, ids),
  };
}

function validateModule(value: unknown, ids: Set<string>): StageModuleNode {
  const source = objectValue(value, "Stage modules");
  const id = uniqueId(source.id, ids);
  if (source.kind !== "module") {
    throw new Error(`Stage node "${id}" must be a module.`);
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
      throw new Error(`Stage slot "${name}" must be an array.`);
    }
    result[name] = nodes.map((node) => validateComponent(node, ids));
  }
  return result;
}

function validateComponent(
  value: unknown,
  ids: Set<string>,
): StageComponentNode {
  const source = objectValue(value, "Stage components");
  const id = uniqueId(source.id, ids);
  if (source.kind !== "component") {
    throw new Error(`Stage node "${id}" must be a component.`);
  }
  return {
    componentType: nonEmptyString(source.componentType, "Component types"),
    config: source.config,
    id,
    kind: "component",
  };
}

function uniqueId(value: unknown, ids: Set<string>): string {
  const id = nonEmptyString(value, "Stage node IDs");
  if (ids.has(id)) throw new Error(`Stage node ID "${id}" is duplicated.`);
  ids.add(id);
  return id;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be objects.`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be non-empty strings.`);
  }
  return value.trim();
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be non-negative integers.`);
  }
  return value as number;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be positive integers.`);
  }
  return value as number;
}
