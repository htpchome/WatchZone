import { html, LitElement } from "lit";

import type { CardConfig, CardHeightMode } from "../core/config";
import { EDITOR_HEIGHT_SELECTOR_TAG } from "../core/constants";
import type { HomeAssistant } from "../core/home-assistant";
import { LocalizationController } from "../core/localization";
import { renderIcon } from "../ui/icons";
import type { SegmentedControlOption } from "../ui/segmented-control";
import "../ui/segmented-control";
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
type AppearanceKey = (typeof APPEARANCE_KEYS)[number];
type PhoneAppearanceKey = `${AppearanceKey}_phone`;
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
      <div class="appearance-grid" role="table">
        <div class="appearance-header" role="row">
          <span role="columnheader"></span>
          ${this._renderDeviceHeading("standard")}
          ${this._renderDeviceHeading("mobile")}
        </div>
        ${this._renderPhoneOnlyBoolean(
          "edge_to_edge_phone",
          this.config?.edge_to_edge_phone !== false,
        )}
        ${
          this.minimal
            ? null
            : APPEARANCE_KEYS.map((key) => this._renderAppearanceRow(key))
        }
      </div>
    `;
  }

  private _renderDeviceHeading(device: "standard" | "mobile") {
    const label = this._localization.localize(
      device === "standard" ? "editor.standard_device" : "editor.mobile_device",
    );
    const description = this._localization.localize(
      device === "standard"
        ? "editor.standard_device_description"
        : "editor.mobile_phone_description",
    );
    return html`
      <span class="device-heading ${device}" role="columnheader">
        <span
          class="device-info"
          role="img"
          tabindex="0"
          aria-label=${description}
        >
          ${renderIcon("informationOutline")}
        </span>
        <span>${label}</span>
        <span class="device-tooltip" role="tooltip">${description}</span>
      </span>
    `;
  }

  private _renderAppearanceRow(key: AppearanceKey) {
    const phoneKey = `${key}_phone` as PhoneAppearanceKey;
    return html`
      <div class="appearance-row" role="row">
        <span class="appearance-label" role="rowheader">
          ${this._localization.localize(`editor.${key}`)}
        </span>
        ${this._renderBoolean(key, this.config?.[key] !== false, "standard")}
        ${this._renderBoolean(
          phoneKey,
          this.config?.[phoneKey] !== false,
          "mobile",
        )}
      </div>
    `;
  }

  private _renderPhoneOnlyBoolean(key: "edge_to_edge_phone", value: boolean) {
    return html`
      <div class="appearance-row" role="row">
        <span class="appearance-label" role="rowheader">
          ${this._localization.localize(`editor.${key}`)}
        </span>
        <span class="not-applicable" aria-label="Not applicable">—</span>
        ${this._renderBoolean(key, value, "mobile")}
      </div>
    `;
  }

  private _renderBoolean(
    key: "edge_to_edge_phone" | AppearanceKey | PhoneAppearanceKey,
    value: boolean,
    device: "standard" | "mobile",
  ) {
    const appearanceKey: "edge_to_edge_phone" | AppearanceKey =
      key === "edge_to_edge_phone"
        ? key
        : (key.replace(/_phone$/, "") as AppearanceKey);
    const label = this._localization.localize(`editor.${appearanceKey}`);
    const deviceLabel = this._localization.localize(
      device === "standard" ? "editor.standard_device" : "editor.mobile_device",
    );
    return html`
      <ha-selector
        class="boolean-option device-boolean-option"
        data-config-key=${key}
        aria-label=${`${label}, ${deviceLabel}`}
        .hass=${this.hass}
        .selector=${BOOLEAN_SELECTOR}
        .value=${value}
        @value-changed=${this._redispatchChange}
      ></ha-selector>
    `;
  }

  private _renderSelector(key: HeightModeKey, value: CardHeightMode) {
    const t = this._localization.localize.bind(this._localization);
    const options = [
      { label: t("editor.card_height_auto"), value: "auto" },
      {
        label: t("editor.card_height_fit_viewport"),
        value: "fit_viewport",
      },
      {
        label: t("editor.card_height_fill_container"),
        value: "fill_container",
      },
    ] satisfies readonly SegmentedControlOption[];
    return html`
      <div class="height-mode-setting">
        <span class="height-mode-label">${t(`editor.${key}`)}</span>
        <wzc-segmented-control
          class="height-mode-control"
          data-config-key=${key}
          appearance="compact"
          .label=${t(`editor.${key}`)}
          .options=${options}
          .value=${value}
          @wzc-segmented-control-value=${this._redispatchChange}
        ></wzc-segmented-control>
      </div>
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
