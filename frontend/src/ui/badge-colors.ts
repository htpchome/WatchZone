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
  "rose",
  "emerald",
  "red",
];

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
  let hash = 0;
  for (const character of normalized) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length] ?? "neutral";
}
