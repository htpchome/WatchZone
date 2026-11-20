import { LitElement } from "lit";

import { CAMERA_CONTROLS_MODULE_TAG } from "../../../core/constants";
import { cameraControlsStyles } from "./camera-controls.styles";

/** Stage surface for the active camera's independently composed controls. */
export class CameraControlsModule extends LitElement {
  static styles = cameraControlsStyles;
}

if (!customElements.get(CAMERA_CONTROLS_MODULE_TAG)) {
  customElements.define(CAMERA_CONTROLS_MODULE_TAG, CameraControlsModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_CONTROLS_MODULE_TAG]: CameraControlsModule;
  }
}
