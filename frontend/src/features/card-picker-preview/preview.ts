import { LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  APP_NAME,
  BADGE_TAG,
  CARD_PICKER_PREVIEW_TAG,
} from "../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { renderIcon } from "../../ui/icons";
import "../../ui/badge";
import { cardPickerPreviewStyles } from "./preview.styles";

const badgeTag = unsafeStatic(BADGE_TAG);

export class CardPickerPreview extends LitElement {
  public static properties = {
    localize: { attribute: false },
  };

  public localize: LocalizeFunction = englishLocalize;

  protected render() {
    return staticHtml`
      <div class="preview" aria-label=${APP_NAME}>
        <div class="live">
          <span class="camera-icon">${renderIcon("camera")}</span>
          <span class="brand">${APP_NAME}</span>
        </div>
        <div class="camera-bar" aria-label=${this.localize("camera.navigation")}>
          <span class="camera-name active">${this.localize(
            "picker.camera_1",
          )}</span>
          <span class="camera-name">${this.localize("picker.camera_2")}</span>
        </div>
        <div class="controls" aria-label=${this.localize("navigation.activity")}>
          <span class="module-controls">
            ${this._control("reviews", "navigation.reviews", true)}
            ${this._control("movie", "navigation.recordings")}
            ${this._control("export", "navigation.exports")}
          </span>
          <span class="accessories">
            ${this._control(
              "presentationPlay",
              "camera.slideshow_enable",
              false,
              true,
            )}
            ${this._control(
              "shieldAlert",
              "camera.alert_takeover_enable",
              false,
              true,
            )}
            ${this._control("filter", "filter.open", false, true)}
            ${this._control("calendar", "calendar.open", false, true)}
          </span>
        </div>
        <div class="day">
          ${this.localize("picker.today")} —
          ${this.localize("navigation.reviews")}
        </div>
        <div class="tiles">
          ${this._tile(
            this.localize("picker.person"),
            this.localize("reviews.detection"),
            `2:35 PM · ${this.localize("picker.front_door")}`,
          )}
          ${this._tile(
            this.localize("picker.vehicle"),
            this.localize("reviews.detection"),
            `2:31 PM · ${this.localize("picker.driveway")}`,
          )}
          ${this._tile(
            this.localize("picker.person"),
            this.localize("reviews.detection"),
            `2:28 PM · ${this.localize("picker.front_door")}`,
          )}
        </div>
      </div>
    `;
  }

  private _control(
    icon:
      | "reviews"
      | "movie"
      | "export"
      | "presentationPlay"
      | "shieldAlert"
      | "filter"
      | "calendar",
    label:
      | "navigation.reviews"
      | "navigation.recordings"
      | "navigation.exports"
      | "camera.slideshow_enable"
      | "camera.alert_takeover_enable"
      | "filter.open"
      | "calendar.open",
    active = false,
    accessory = false,
  ) {
    return staticHtml`<span
      class="control ${active ? "active" : ""} ${accessory ? "accessory" : ""}"
      title=${this.localize(label)}
      aria-label=${this.localize(label)}
      >${renderIcon(icon)}</span
    >`;
  }

  private _tile(object: string, type: string, details: string) {
    return staticHtml`<div class="tile">
      <div class="thumbnail">${renderIcon("camera")}</div>
      <div class="metadata">
        <div class="badges">
          <${badgeTag} color="blue">${object}</${badgeTag}>
          <${badgeTag} color="amber">${type}</${badgeTag}>
        </div>
        <span class="details">${details}</span>
        <span class="details">✓ ${this.localize("reviews.reviewed")}</span>
      </div>
    </div>`;
  }

  static styles = cardPickerPreviewStyles;
}

if (!customElements.get(CARD_PICKER_PREVIEW_TAG)) {
  customElements.define(CARD_PICKER_PREVIEW_TAG, CardPickerPreview);
}

declare global {
  interface HTMLElementTagNameMap {
    [CARD_PICKER_PREVIEW_TAG]: CardPickerPreview;
  }
}
