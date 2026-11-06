import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { CardConfig } from "../core/config";

const SQUARE_CORNERS_ATTRIBUTE = "data-wzc-square-outer-corners";
const NO_SHADOW_ATTRIBUTE = "data-wzc-no-outer-shadow";
const CARD_RADIUS_PROPERTY = "--wzc-card-radius";
const THEME_CARD_RADIUS_PROPERTY = "--wzc-theme-card-radius";
const HA_CARD_RADIUS_PROPERTY = "--ha-card-border-radius";
const HA_CARD_SHADOW_PROPERTY = "--ha-card-box-shadow";

type AppearanceHost = HTMLElement & ReactiveControllerHost;

interface CardHostAppearance {
  readonly outerShadows: boolean;
  readonly roundedCorners: boolean;
}

interface InlineStyleSnapshot {
  readonly priority: string;
  readonly value: string;
}

interface HostAppearanceSnapshot {
  readonly attributes: ReadonlyMap<string, string | null>;
  readonly styles: ReadonlyMap<string, InlineStyleSnapshot>;
}

const MANAGED_ATTRIBUTES = [
  SQUARE_CORNERS_ATTRIBUTE,
  NO_SHADOW_ATTRIBUTE,
] as const;

const MANAGED_STYLES = [
  CARD_RADIUS_PROPERTY,
  THEME_CARD_RADIUS_PROPERTY,
  HA_CARD_RADIUS_PROPERTY,
  "border-radius",
  HA_CARD_SHADOW_PROPERTY,
  "box-shadow",
] as const;

/** Owns the Home Assistant card-host appearance boundary and its cleanup. */
export class CardHostAppearanceController implements ReactiveController {
  private _appearance: CardHostAppearance = {
    outerShadows: true,
    roundedCorners: true,
  };
  private _connected = false;
  private _snapshot?: HostAppearanceSnapshot;

  public constructor(private readonly _host: AppearanceHost) {
    _host.addController(this);
  }

  public configure(config: CardConfig): void {
    this._appearance = {
      outerShadows: config.outer_shadows !== false,
      roundedCorners: config.rounded_outer_corners !== false,
    };
    if (this._connected) this._apply();
  }

  public hostConnected(): void {
    this._connected = true;
    this._snapshot = this._capture();
    this._apply();
  }

  public hostDisconnected(): void {
    this._restore();
    this._snapshot = undefined;
    this._connected = false;
  }

  private _apply(): void {
    const { outerShadows, roundedCorners } = this._appearance;
    this._host.toggleAttribute(SQUARE_CORNERS_ATTRIBUTE, !roundedCorners);
    this._host.toggleAttribute(NO_SHADOW_ATTRIBUTE, !outerShadows);

    if (roundedCorners) {
      this._host.style.removeProperty(CARD_RADIUS_PROPERTY);
      this._host.style.removeProperty(HA_CARD_RADIUS_PROPERTY);
      this._host.style.removeProperty(THEME_CARD_RADIUS_PROPERTY);
      this._host.style.setProperty(
        "border-radius",
        "var(--wzc-card-radius)",
        "important",
      );
    } else {
      this._preserveThemeRadius();
      this._host.style.setProperty(CARD_RADIUS_PROPERTY, "0px");
      this._host.style.setProperty(HA_CARD_RADIUS_PROPERTY, "0px");
      this._host.style.setProperty("border-radius", "0px", "important");
    }

    if (outerShadows) {
      this._host.style.setProperty(
        HA_CARD_SHADOW_PROPERTY,
        "var(--wzc-shadow-medium)",
      );
      this._host.style.setProperty(
        "box-shadow",
        "var(--wzc-shadow-medium)",
        "important",
      );
    } else {
      this._host.style.setProperty(HA_CARD_SHADOW_PROPERTY, "none");
      this._host.style.setProperty("box-shadow", "none", "important");
    }
  }

  private _preserveThemeRadius(): void {
    if (this._host.style.getPropertyValue(THEME_CARD_RADIUS_PROPERTY)) return;
    const radius = getComputedStyle(this._host)
      .getPropertyValue("--wzc-radius-card")
      .trim();
    if (radius && radius !== "0px") {
      this._host.style.setProperty(THEME_CARD_RADIUS_PROPERTY, radius);
    }
  }

  private _capture(): HostAppearanceSnapshot {
    return {
      attributes: new Map(
        MANAGED_ATTRIBUTES.map((name) => [name, this._host.getAttribute(name)]),
      ),
      styles: new Map(
        MANAGED_STYLES.map((name) => [
          name,
          {
            priority: this._host.style.getPropertyPriority(name),
            value: this._host.style.getPropertyValue(name),
          },
        ]),
      ),
    };
  }

  private _restore(): void {
    const snapshot = this._snapshot;
    if (!snapshot) return;
    for (const [name, value] of snapshot.attributes) {
      if (value === null) this._host.removeAttribute(name);
      else this._host.setAttribute(name, value);
    }
    for (const [name, { priority, value }] of snapshot.styles) {
      if (value) this._host.style.setProperty(name, value, priority);
      else this._host.style.removeProperty(name);
    }
  }
}
