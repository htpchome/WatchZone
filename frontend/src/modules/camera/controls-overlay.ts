import { html, LitElement, nothing, type TemplateResult } from "lit";

import {
  DeviceProfileController,
  type DeviceClass,
} from "../../core/device-profile";
import { CAMERA_CONTROLS_TAG } from "../../core/constants";
import { renderIcon, type IconName } from "../../ui/icons";
import { cameraControlsStyles } from "./controls-overlay.styles";

export type CameraControlAction =
  "fullscreen" | "mute" | "picture_in_picture" | "snapshot" | "suspend";

export interface CameraControlEventDetail {
  readonly action: CameraControlAction;
}

interface ControlDefinition {
  readonly action: CameraControlAction;
  readonly placeholder?: boolean;
}

const ALL_DEVICE_CLASSES: readonly DeviceClass[] = [
  "phone",
  "tablet",
  "desktop",
];

export const CAMERA_CONTROL_DEVICE_MATRIX: Readonly<
  Record<CameraControlAction, readonly DeviceClass[]>
> = {
  suspend: ALL_DEVICE_CLASSES,
  picture_in_picture: ALL_DEVICE_CLASSES,
  snapshot: ALL_DEVICE_CLASSES,
  fullscreen: ALL_DEVICE_CLASSES,
  mute: ALL_DEVICE_CLASSES,
};

const CONTROLS: readonly ControlDefinition[] = [
  { action: "suspend", placeholder: true },
  { action: "picture_in_picture" },
  { action: "snapshot", placeholder: true },
  { action: "fullscreen" },
  { action: "mute" },
];

function iconName(
  action: CameraControlAction,
  muted: boolean,
  fullscreenActive: boolean,
): IconName {
  if (action === "suspend") return "power";
  if (action === "picture_in_picture") return "pipPopOut";
  if (action === "snapshot") return "takeSnapshot";
  if (action === "fullscreen") {
    return fullscreenActive ? "fullscreenExit" : "fullscreen";
  }
  return muted ? "volumeOff" : "volumeOn";
}

export class CameraControls extends LitElement {
  public static properties = {
    errorMessage: { attribute: false },
    fullscreenActive: { attribute: false, type: Boolean },
    fullscreenSupported: { attribute: false, type: Boolean },
    muted: { attribute: false, type: Boolean },
    pictureInPictureActive: { attribute: false, type: Boolean },
    pictureInPictureSupported: { attribute: false, type: Boolean },
    visible: { reflect: true, type: Boolean },
  };

  public errorMessage?: string;
  public fullscreenActive = false;
  public fullscreenSupported = false;
  public muted = true;
  public pictureInPictureActive = false;
  public pictureInPictureSupported = false;
  public visible = false;

  private readonly _deviceProfile = new DeviceProfileController(this);

  protected render() {
    return html`
      <div class="control-group" role="toolbar" aria-label="Camera controls">
        ${CONTROLS.filter((control) =>
          CAMERA_CONTROL_DEVICE_MATRIX[control.action].includes(
            this._deviceProfile.profile.deviceClass,
          ),
        ).map((control) => this._renderControl(control))}
      </div>
      ${
        this.errorMessage
          ? html`<div class="control-error" role="alert">
              ${this.errorMessage}
            </div>`
          : nothing
      }
    `;
  }

  private _renderControl(control: ControlDefinition): TemplateResult {
    const active =
      control.action === "mute"
        ? this.muted
        : control.action === "fullscreen"
          ? this.fullscreenActive
          : control.action === "picture_in_picture"
            ? this.pictureInPictureActive
            : false;
    const supported =
      control.action === "fullscreen"
        ? this.fullscreenSupported
        : control.action === "picture_in_picture"
          ? this.pictureInPictureSupported
          : !control.placeholder;
    const label =
      control.action === "mute"
        ? this.muted
          ? "Unmute camera"
          : "Mute camera"
        : control.action === "fullscreen"
          ? this.fullscreenActive
            ? "Exit fullscreen"
            : "Enter fullscreen"
          : control.action === "picture_in_picture"
            ? this.pictureInPictureActive
              ? "Exit Picture-in-Picture"
              : "Enter Picture-in-Picture"
            : control.action === "snapshot"
              ? "Take snapshot (coming soon)"
              : "Suspend camera (coming soon)";

    return html`<button
      class="control-button"
      type="button"
      data-control=${control.action}
      title=${label}
      aria-label=${label}
      aria-pressed=${active ? "true" : "false"}
      ?disabled=${!supported}
      @click=${() => this._dispatch(control.action)}
    >
      ${renderIcon(iconName(control.action, this.muted, this.fullscreenActive))}
    </button>`;
  }

  private _dispatch(action: CameraControlAction): void {
    this.dispatchEvent(
      new CustomEvent<CameraControlEventDetail>("camera-control", {
        bubbles: true,
        composed: true,
        detail: { action },
      }),
    );
  }

  static styles = cameraControlsStyles;
}

if (!customElements.get(CAMERA_CONTROLS_TAG)) {
  customElements.define(CAMERA_CONTROLS_TAG, CameraControls);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_CONTROLS_TAG]: CameraControls;
  }
}
