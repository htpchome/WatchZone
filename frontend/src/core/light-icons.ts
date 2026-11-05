export const DEFAULT_LIGHT_ICON = "mdi:lightbulb-off-outline";
export const DEFAULT_LIGHT_ICON_ON = "mdi:lightbulb";

const STATEFUL_LIGHT_ICONS = new Set([
  DEFAULT_LIGHT_ICON,
  DEFAULT_LIGHT_ICON_ON,
]);

/** Returns the configured icon, using paired bulb artwork when applicable. */
export function lightIconForState(icon: string, on: boolean): string {
  if (STATEFUL_LIGHT_ICONS.has(icon)) {
    return on ? DEFAULT_LIGHT_ICON_ON : DEFAULT_LIGHT_ICON;
  }
  return icon;
}

export function normalizeLightIcon(value: unknown): string {
  return typeof value === "string" && /^mdi:[a-z0-9-]+$/.test(value.trim())
    ? value.trim()
    : DEFAULT_LIGHT_ICON;
}
