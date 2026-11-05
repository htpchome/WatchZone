export const DEFAULT_LIGHT_ICON = "mdi:lightbulb-off-outline";

export interface LightStateIcons {
  readonly off: string;
  readonly on: string;
}

const STATEFUL_LIGHT_ICONS: Readonly<Record<string, LightStateIcons>> = {
  "mdi:lightbulb": {
    off: "mdi:lightbulb-off",
    on: "mdi:lightbulb-on",
  },
  "mdi:lightbulb-off": {
    off: "mdi:lightbulb-off",
    on: "mdi:lightbulb-on",
  },
  "mdi:lightbulb-on": {
    off: "mdi:lightbulb-off",
    on: "mdi:lightbulb-on",
  },
  "mdi:lightbulb-outline": {
    off: "mdi:lightbulb-off-outline",
    on: "mdi:lightbulb-on-outline",
  },
  [DEFAULT_LIGHT_ICON]: {
    off: "mdi:lightbulb-off-outline",
    on: "mdi:lightbulb-on-outline",
  },
  "mdi:lightbulb-on-outline": {
    off: "mdi:lightbulb-off-outline",
    on: "mdi:lightbulb-on-outline",
  },
};

export function normalizeLightIcon(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : DEFAULT_LIGHT_ICON;
}

/** Resolves known stateful pairs; custom icons intentionally remain unchanged. */
export function lightIconForState(icon: string, on: boolean): string {
  const pair = STATEFUL_LIGHT_ICONS[icon];
  return pair ? (on ? pair.on : pair.off) : icon;
}
