import { html, LitElement } from "lit";

import { CAMERA_TAG } from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import { cameraStyles } from "./camera.styles";
import "./live-view";

export type CameraShadowStyle = "medium" | "none" | "small";

/** Stable composition boundary for current and future camera presentations. */
export class CameraModule extends LitElement {
  public static properties = {
    api: { attribute: false },
    available: { attribute: false, type: Boolean },
    entityId: { attribute: false },
    posterUrl: { attribute: false },
    roundedCorners: { attribute: false, type: Boolean },
    shadowStyle: { attribute: false },
    startUnmutedPcTablet: { attribute: false, type: Boolean },
    startUnmutedPhone: { attribute: false, type: Boolean },
  };

  public api?: HomeAssistantApi;
  public available = false;
  public entityId?: string;
  public posterUrl?: string;
  public roundedCorners = true;
  public shadowStyle: CameraShadowStyle = "medium";
  public startUnmutedPcTablet = false;
  public startUnmutedPhone = false;

  protected render() {
    return html`
      <div
        class=${[
          "camera",
          this.roundedCorners ? "" : "square-camera-corners",
          this.shadowStyle === "small" ? "camera-shadow-small" : "",
          this.shadowStyle === "none" ? "camera-shadow-none" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <watchzone-camera-live-view
          .api=${this.api}
          .available=${this.available}
          .startUnmutedPcTablet=${this.startUnmutedPcTablet}
          .startUnmutedPhone=${this.startUnmutedPhone}
          .entityId=${this.entityId}
          .posterUrl=${this.posterUrl}
        ></watchzone-camera-live-view>
      </div>
    `;
  }

  static styles = cameraStyles;
}

if (!customElements.get(CAMERA_TAG)) {
  customElements.define(CAMERA_TAG, CameraModule);
}

declare global {
  interface HTMLElementTagNameMap {
    "watchzone-camera": CameraModule;
  }
}
