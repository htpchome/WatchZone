/**
 * The narrow write-only bridge to Home Assistant's card host styling hooks.
 * Feature components consume application tokens and do not name HA tokens.
 */
const HA_CARD_RADIUS_PROPERTY = "--ha-card-border-radius";
const HA_CARD_SHADOW_PROPERTY = "--ha-card-box-shadow";

export interface HomeAssistantCardAppearance {
  readonly outerShadows: boolean;
  readonly roundedCorners: boolean;
}

export function syncHomeAssistantCardHostAppearance(
  host: HTMLElement,
  appearance: HomeAssistantCardAppearance,
): void {
  if (appearance.roundedCorners) {
    host.style.removeProperty(HA_CARD_RADIUS_PROPERTY);
    host.style.setProperty(
      "border-radius",
      "var(--wzc-card-radius)",
      "important",
    );
  } else {
    host.style.setProperty(HA_CARD_RADIUS_PROPERTY, "0px");
    host.style.setProperty("border-radius", "0px", "important");
  }

  if (appearance.outerShadows) {
    host.style.setProperty(HA_CARD_SHADOW_PROPERTY, "var(--wzc-shadow-medium)");
    host.style.setProperty(
      "box-shadow",
      "var(--wzc-shadow-medium)",
      "important",
    );
  } else {
    host.style.setProperty(HA_CARD_SHADOW_PROPERTY, "none");
    host.style.setProperty("box-shadow", "none", "important");
  }
}
