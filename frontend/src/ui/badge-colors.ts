/** Stable badge palette names shared by object, zone, and identity labels. */
export type BadgeColor =
  | "amber"
  | "blue"
  | "cyan"
  | "emerald"
  | "green"
  | "indigo"
  | "neutral"
  | "orange"
  | "pink"
  | "purple"
  | "red"
  | "rose"
  | "yellow";

const FALLBACK_PALETTE: readonly BadgeColor[] = [
  "blue",
  "purple",
  "amber",
  "green",
  "pink",
  "cyan",
  "yellow",
  "orange",
  "indigo",
  "emerald",
];

const COLOR_FAMILIES: Readonly<Record<BadgeColor, string>> = {
  amber: "gold",
  blue: "cool",
  cyan: "cool",
  emerald: "green",
  green: "green",
  indigo: "cool",
  neutral: "neutral",
  orange: "gold",
  pink: "red",
  purple: "purple",
  red: "red",
  rose: "red",
  yellow: "gold",
};

/**
 * Presentation policy only: providers remain responsible for supplying labels.
 * Known Frigate labels retain familiar colors; unknown labels hash to a stable
 * palette entry so the same object is presented consistently throughout WZC.
 */
export const OBJECT_BADGE_COLORS: Readonly<Record<string, BadgeColor>> = {
  person: "blue",
  car: "purple",
  motion: "amber",
  dog: "green",
  cat: "pink",
  bicycle: "cyan",
  bird: "yellow",
  package: "orange",
  face: "indigo",
  truck: "rose",
  bus: "emerald",
  motorcycle: "red",
  license_plate: "neutral",
  animal: "green",
  zone: "neutral",
  resident: "emerald",
  person_verified: "indigo",
  special: "red",
  northern_cardinal: "red",
};

const PINNED_BADGE_COLORS: Readonly<Record<string, BadgeColor>> = {
  northern_cardinal: "red",
};

export function normalizeBadgeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function badgeColorForLabel(label: string): BadgeColor {
  const normalized = normalizeBadgeLabel(label);
  const known = OBJECT_BADGE_COLORS[normalized];
  if (known) return known;
  if (!normalized) return "neutral";
  return (
    FALLBACK_PALETTE[badgeHash(normalized) % FALLBACK_PALETTE.length] ??
    "neutral"
  );
}

/** Resolves one tile's labels without duplicate or neighboring color families. */
export function distinctBadgeColorsForLabels(
  labels: readonly string[],
  reservedColors: readonly BadgeColor[] = [],
): readonly BadgeColor[] {
  const usedColors = new Set<BadgeColor>(reservedColors);
  const usedFamilies = new Set(
    reservedColors.map((color) => COLOR_FAMILIES[color]),
  );
  return labels.map((label) => {
    const normalized = normalizeBadgeLabel(label);
    const pinned = PINNED_BADGE_COLORS[normalized];
    if (pinned) {
      usedColors.add(pinned);
      usedFamilies.add(COLOR_FAMILIES[pinned]);
      return pinned;
    }
    const preferred = badgeColorForLabel(label);
    const offset = badgeHash(normalized) % FALLBACK_PALETTE.length;
    const rotated = [
      ...FALLBACK_PALETTE.slice(offset),
      ...FALLBACK_PALETTE.slice(0, offset),
    ];
    const candidates = [preferred, ...rotated];
    const color =
      candidates.find(
        (candidate) =>
          !usedColors.has(candidate) &&
          !usedFamilies.has(COLOR_FAMILIES[candidate]),
      ) ??
      candidates.find((candidate) => !usedColors.has(candidate)) ??
      preferred;
    usedColors.add(color);
    usedFamilies.add(COLOR_FAMILIES[color]);
    return color;
  });
}

function badgeHash(normalized: string): number {
  let hash = 0;
  for (const character of normalized) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}
