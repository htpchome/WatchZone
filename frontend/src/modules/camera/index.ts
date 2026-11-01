import { html, LitElement } from "lit";

import { CAMERA_TAG } from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import { cameraStyles } from "./camera.styles";
import "./live-view";

/** Stable composition boundary for current and future camera presentations. */
export class WatchZoneCamera extends LitElement {
  public static properties = {
    api: { attribute: false },
    available: { attribute: false, type: Boolean },
    entityId: { attribute: false },
    posterUrl: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public available = false;
  public entityId?: string;
  public posterUrl?: string;

  protected render() {
    return html`
      <div class="camera">
        <watchzone-camera-live-view
          .api=${this.api}
          .available=${this.available}
          .entityId=${this.entityId}
          .posterUrl=${this.posterUrl}
        ></watchzone-camera-live-view>
      </div>
    `;
  }

  static styles = cameraStyles;
}

if (!customElements.get(CAMERA_TAG)) {
  customElements.define(CAMERA_TAG, WatchZoneCamera);
}

declare global {
  interface HTMLElementTagNameMap {
    "watchzone-camera": WatchZoneCamera;
  }
}
