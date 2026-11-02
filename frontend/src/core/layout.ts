export interface LayoutContainerNode {
  readonly children: readonly LayoutNode[];
  readonly id: string;
  readonly kind: "container";
}

export interface LayoutModuleNode {
  readonly config: unknown;
  readonly id: string;
  readonly kind: "module";
  readonly moduleType: string;
}

export type LayoutNode = LayoutContainerNode | LayoutModuleNode;

export interface LayoutDocument {
  readonly root: LayoutContainerNode;
}

export function validateLayoutDocument(value: unknown): LayoutDocument {
  if (typeof value !== "object" || value === null || !("root" in value)) {
    throw new Error("The layout must contain a root container.");
  }
  const ids = new Set<string>();
  const root = validateNode((value as { readonly root: unknown }).root, ids);
  if (root.kind !== "container") {
    throw new Error("The layout root must be a container.");
  }
  return { root };
}

function validateNode(value: unknown, ids: Set<string>): LayoutNode {
  if (typeof value !== "object" || value === null) {
    throw new Error("Every layout node must be an object.");
  }
  const source = value as Record<string, unknown>;
  const id = nonEmptyString(source.id, "Layout node IDs");
  if (ids.has(id)) {
    throw new Error(`Layout node ID "${id}" is duplicated.`);
  }
  ids.add(id);

  if (source.kind === "container") {
    if (!Array.isArray(source.children)) {
      throw new Error(`Layout container "${id}" must contain a child array.`);
    }
    return {
      children: source.children.map((child) => validateNode(child, ids)),
      id,
      kind: "container",
    };
  }
  if (source.kind === "module") {
    return {
      config: source.config,
      id,
      kind: "module",
      moduleType: nonEmptyString(source.moduleType, "Module types"),
    };
  }
  throw new Error(`Layout node "${id}" has an unknown kind.`);
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be non-empty strings.`);
  }
  return value.trim();
}
