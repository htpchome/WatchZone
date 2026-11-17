import { html, LitElement } from "lit";

import type { CardConfig, CardHeightMode } from "../core/config";
import { EDITOR_HEIGHT_SELECTOR_TAG } from "../core/constants";
import type { HomeAssistant } from "../core/home-assistant";
import { LocalizationController } from "../core/localization";
import {
  heightModeInfoStyles,
  heightModeSelectorStyles,
} from "./height-mode-info.styles";

type HeightModeKey = "card_height_mode" | "card_height_mode_phone";
const APPEARANCE_KEYS = [
  "rounded_outer_corners",
  "outer_shadows",
  "outer_padding",
  "camera_rounded_corners",
  "camera_shadows",
  "camera_bar_rounded_corners",
  "camera_bar_shadows",
  "event_rounded_corners",
  "event_shadows",
] as const;
const BOOLEAN_SELECTOR = { boolean: {} } as const;

interface ValueChangedEvent extends Event {
  readonly detail: { readonly value?: unknown };
}

export class HeightModeSelector extends LitElement {
  public static properties = {
    hass: { attribute: false },
    config: { attribute: false },
    minimal: { type: Boolean },
  };

  public static styles = [heightModeSelectorStyles, heightModeInfoStyles];

  public config?: CardConfig;
  public hass?: HomeAssistant;
  public minimal = false;
  private readonly _localization = new LocalizationController(this);

  protected willUpdate(): void {
    if (this.hass) {
      this._localization.setLanguage(
        this.hass.locale?.language ?? this.hass.language,
      );
    }
  }

  protected render() {
    return html`
      ${this._renderSelector("card_height_mode", this.config?.card_height_mode ?? "auto")}
      ${this._renderSelector("card_height_mode_phone", this.config?.card_height_mode_phone ?? "auto")}
      <details>
        <summary>
          ${this._localization.localize("editor.card_height_details")}
        </summary>
        <dl>
          <dt>${this._localization.localize("editor.card_height_auto")}</dt>
          <dd>
            ${this._localization.localize("editor.card_height_auto_description")}
          </dd>
          <dt>
            ${this._localization.localize("editor.card_height_fit_viewport")}
          </dt>
          <dd>
            ${this._localization.localize("editor.card_height_fit_viewport_description")}
          </dd>
          <dt>
            ${this._localization.localize("editor.card_height_fill_container")}
          </dt>
          <dd>
            ${this._localization.localize("editor.card_height_fill_container_description")}
          </dd>
        </dl>
      </details>
      ${this._renderBoolean("edge_to_edge_phone", this.config?.edge_to_edge_phone === true)}
      ${
        this.minimal
          ? null
          : APPEARANCE_KEYS.map((key) =>
              this._renderBoolean(key, this.config?.[key] !== false),
            )
      }
    `;
  }

  private _renderBoolean(
    key: "edge_to_edge_phone" | (typeof APPEARANCE_KEYS)[number],
    value: boolean,
  ) {
    return html`
      <ha-selector
        class="boolean-option"
        data-config-key=${key}
        label=${this._localization.localize(`editor.${key}`)}
        .hass=${this.hass}
        .selector=${BOOLEAN_SELECTOR}
        .value=${value}
        @value-changed=${this._redispatchChange}
      ></ha-selector>
    `;
  }

  private _renderSelector(key: HeightModeKey, value: CardHeightMode) {
    const t = this._localization.localize.bind(this._localization);
    return html`
      <ha-selector
        data-config-key=${key}
        label=${t(`editor.${key}`)}
        .hass=${this.hass}
        .selector=${{
          select: {
            mode: "dropdown",
            options: [
              { label: t("editor.card_height_auto"), value: "auto" },
              {
                label: t("editor.card_height_fit_viewport"),
                value: "fit_viewport",
              },
              {
                label: t("editor.card_height_fill_container"),
                value: "fill_container",
              },
            ],
          },
        }}
        .value=${value}
        @value-changed=${this._redispatchChange}
      ></ha-selector>
    `;
  }

  private readonly _redispatchChange = (event: ValueChangedEvent): void => {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: {
          key: (event.currentTarget as HTMLElement).dataset.configKey,
          value: event.detail.value,
        },
      }),
    );
  };
}

if (!customElements.get(EDITOR_HEIGHT_SELECTOR_TAG)) {
  customElements.define(EDITOR_HEIGHT_SELECTOR_TAG, HeightModeSelector);
}

declare global {
  interface HTMLElementTagNameMap {
    [EDITOR_HEIGHT_SELECTOR_TAG]: HeightModeSelector;
  }
}
