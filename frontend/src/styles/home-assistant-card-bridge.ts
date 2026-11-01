/**
 * The narrow write-only bridge to Home Assistant's card host styling hooks.
 * Feature components consume WatchZone tokens and do not name HA tokens.
 */
const HA_CARD_RADIUS_PROPERTY = "--ha-card-border-radius";
const HA_CARD_SHADOW_PROPERTY = "--ha-card-box-shadow";

export interface HomeAssistantCardAppearance {
  readonly flat: boolean;
  readonly square: boolean;
}

export function syncHomeAssistantCardHostAppearance(
  host: HTMLElement,
  appearance: HomeAssistantCardAppearance,
): void {
  if (appearance.square) {
    host.style.setProperty(HA_CARD_RADIUS_PROPERTY, "0px");
    host.style.setProperty("border-radius", "0px", "important");
  } else {
    host.style.removeProperty(HA_CARD_RADIUS_PROPERTY);
    host.style.removeProperty("border-radius");
  }

  if (appearance.flat) {
    host.style.setProperty(HA_CARD_SHADOW_PROPERTY, "none");
    host.style.setProperty("box-shadow", "none", "important");
  } else {
    host.style.removeProperty(HA_CARD_SHADOW_PROPERTY);
    host.style.removeProperty("box-shadow");
  }
}
