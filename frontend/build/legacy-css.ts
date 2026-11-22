const LEGACY_INSET_MARKER = "wzc-legacy-inset-fallback";

const insetDeclaration = new RegExp(
  String.raw`^(\s*)(inset(?:-(?:block|inline)(?:-(?:start|end))?)?)\s*:\s*([^;]+);`,
  "gmu",
);

function splitCssValues(value: string): string[] {
  const values: string[] = [];
  let current = "";
  let depth = 0;
  for (const character of value.trim()) {
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    if (/\s/u.test(character) && depth === 0) {
      if (current) values.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (current) values.push(current);
  return values;
}

function insetEdges(values: readonly string[]): {
  readonly bottom: string;
  readonly left: string;
  readonly right: string;
  readonly top: string;
} {
  const top = values[0] ?? "auto";
  const right = values[1] ?? top;
  const bottom = values[2] ?? top;
  const left = values[3] ?? right;
  return { bottom, left, right, top };
}

function physicalFallbacks(property: string, value: string): string[] {
  const values = splitCssValues(value);
  if (property === "inset") {
    const edges = insetEdges(values);
    return [
      `top: ${edges.top};`,
      `right: ${edges.right};`,
      `bottom: ${edges.bottom};`,
      `left: ${edges.left};`,
    ];
  }
  if (property === "inset-block") {
    return [
      `top: ${values[0] ?? "auto"};`,
      `bottom: ${values[1] ?? values[0] ?? "auto"};`,
    ];
  }
  if (property === "inset-inline") {
    return [
      `left: ${values[0] ?? "auto"};`,
      `right: ${values[1] ?? values[0] ?? "auto"};`,
    ];
  }
  const edge = {
    "inset-block-end": "bottom",
    "inset-block-start": "top",
    "inset-inline-end": "right",
    "inset-inline-start": "left",
  }[property];
  return edge ? [`${edge}: ${values[0] ?? "auto"};`] : [];
}

/** Adds physical positioning before logical/shorthand inset for Chromium 86. */
export function expandLegacyInsetFallbacks(source: string): string {
  if (source.includes(LEGACY_INSET_MARKER)) return source;
  let changed = false;
  const transformed = source.replace(
    insetDeclaration,
    (declaration, indent: string, property: string, value: string) => {
      const fallbacks = physicalFallbacks(property, value);
      if (fallbacks.length === 0) return declaration;
      changed = true;
      return [
        `${indent}/* ${LEGACY_INSET_MARKER} */`,
        ...fallbacks.map((fallback) => `${indent}${fallback}`),
        declaration,
      ].join("\n");
    },
  );
  return changed ? transformed : source;
}

export function isCameraOpticsStyleModule(id: string): boolean {
  return /(?:^|\/)[^/]+\.styles\.ts(?:\?|$)/u.test(id);
}
