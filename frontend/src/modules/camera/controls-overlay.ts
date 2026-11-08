import { html, LitElement, type TemplateResult } from "lit";

import {
  DeviceProfileController,
  type DeviceClass,
} from "../../core/device-profile";
import { CAMERA_CONTROLS_TAG } from "../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { renderIcon, type IconName } from "../../ui/icons";
import { cameraControlsStyles } from "./controls-overlay.styles";

export type CameraControlAction =
  "fullscreen" | "mute" | "picture_in_picture" | "snapshot" | "suspend";

export interface CameraControlEventDetail {
  readonly action: CameraControlAction;
}

interface ControlDefinition {
  readonly action: CameraControlAction;
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
  { action: "suspend" },
  { action: "picture_in_picture" },
  { action: "snapshot" },
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
    fullscreenActive: { attribute: false, type: Boolean },
    fullscreenSupported: { attribute: false, type: Boolean },
    muted: { attribute: false, type: Boolean },
    localize: { attribute: false },
    pictureInPictureActive: { attribute: false, type: Boolean },
    pictureInPictureSupported: { attribute: false, type: Boolean },
    snapshotPending: { attribute: false, type: Boolean },
    suspendPending: { attribute: false, type: Boolean },
    suspendSupported: { attribute: false, type: Boolean },
    suspended: { attribute: false, type: Boolean },
    visible: { reflect: true, type: Boolean },
  };

  public fullscreenActive = false;
  public fullscreenSupported = false;
  public muted = true;
  public localize: LocalizeFunction = englishLocalize;
  public pictureInPictureActive = false;
  public pictureInPictureSupported = false;
  public snapshotPending = false;
  public suspendPending = false;
  public suspendSupported = false;
  public suspended = false;
  public visible = false;

  private readonly _deviceProfile = new DeviceProfileController(this);

  protected render() {
    return html`
      <div
        class="control-group media-overlay-control-group"
        role="toolbar"
        aria-label=${this.localize("camera.controls")}
      >
        ${CONTROLS.filter(
          (control) =>
            CAMERA_CONTROL_DEVICE_MATRIX[control.action].includes(
              this._deviceProfile.profile.deviceClass,
            ) &&
            (control.action !== "suspend" || this.suspendSupported) &&
            (!this.suspended || control.action === "suspend"),
        ).map((control) => this._renderControl(control))}
      </div>
    `;
  }

  private _renderControl(control: ControlDefinition): TemplateResult {
    const active =
      control.action === "mute"
        ? this.muted
        : control.action === "suspend"
          ? this.suspended
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
          : control.action === "suspend"
            ? this.suspendSupported
            : true;
    const pending =
      control.action === "snapshot"
        ? this.snapshotPending
        : control.action === "suspend"
          ? this.suspendPending
          : false;
    const label =
      control.action === "mute"
        ? this.muted
          ? this.localize("camera.unmute")
          : this.localize("camera.mute")
        : control.action === "fullscreen"
          ? this.fullscreenActive
            ? this.localize("camera.exit_fullscreen")
            : this.localize("camera.enter_fullscreen")
          : control.action === "picture_in_picture"
            ? this.pictureInPictureActive
              ? this.localize("camera.exit_pip")
              : this.localize("camera.enter_pip")
            : control.action === "snapshot"
              ? this.snapshotPending
                ? this.localize("camera.saving_snapshot")
                : this.localize("camera.take_snapshot")
              : this.suspendPending
                ? this.suspended
                  ? this.localize("camera.resuming")
                  : this.localize("camera.suspending")
                : this.suspended
                  ? this.localize("camera.resume")
                  : this.localize("camera.suspend");

    return html`<button
      class="control-button media-overlay-control-button"
      type="button"
      data-control=${control.action}
      title=${label}
      aria-label=${label}
      aria-pressed=${active ? "true" : "false"}
      ?disabled=${!supported || pending}
      @pointerup=${this._releaseTouchFocus}
      @click=${() => this._dispatch(control.action)}
    >
      ${renderIcon(iconName(control.action, this.muted, this.fullscreenActive))}
    </button>`;
  }

  private readonly _releaseTouchFocus = (event: PointerEvent): void => {
    if (event.pointerType === "touch")
      (event.currentTarget as HTMLButtonElement).blur();
  };

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
