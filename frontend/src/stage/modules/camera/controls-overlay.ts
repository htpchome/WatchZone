import { LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import type { DeviceClass } from "../../../core/device-profile";
import {
  CAMERA_CONTROLS_TAG,
  MEDIA_CONTROL_EVENT,
  MEDIA_CONTROLS_TAG,
} from "../../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import type { IconName } from "../../../ui/icons";
import type {
  MediaControlDescriptor,
  MediaControlEventDetail,
} from "../../../ui/media-controls-overlay";
import "../../../ui/media-controls-overlay";
import { cameraControlsStyles } from "./controls-overlay.styles";

const mediaControlsTag = unsafeStatic(MEDIA_CONTROLS_TAG);
const mediaControlEvent = unsafeStatic(MEDIA_CONTROL_EVENT);

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
  picture_in_picture: ["tablet", "desktop"],
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
    deviceClass: { attribute: false },
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
  public deviceClass: DeviceClass = "desktop";
  public muted = true;
  public localize: LocalizeFunction = englishLocalize;
  public pictureInPictureActive = false;
  public pictureInPictureSupported = false;
  public snapshotPending = false;
  public suspendPending = false;
  public suspendSupported = false;
  public suspended = false;
  public visible = false;

  protected render() {
    const controls = CONTROLS.filter(
      (control) =>
        CAMERA_CONTROL_DEVICE_MATRIX[control.action].includes(
          this.deviceClass,
        ) &&
        (control.action !== "suspend" || this.suspendSupported) &&
        (!this.suspended || control.action === "suspend"),
    ).map((control) => this._controlDescriptor(control));
    return staticHtml`<${mediaControlsTag}
      .controls=${controls}
      .label=${this.localize("camera.controls")}
      .visible=${this.visible}
      .viewportEdge=${this.fullscreenActive}
      @${mediaControlEvent}=${this._handleControl}
    ></${mediaControlsTag}>`;
  }

  private _controlDescriptor(
    control: ControlDefinition,
  ): MediaControlDescriptor<CameraControlAction> {
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

    return {
      action: control.action,
      active,
      disabled: !supported,
      icon: iconName(control.action, this.muted, this.fullscreenActive),
      label,
      pending,
    };
  }

  private readonly _handleControl = (
    event: CustomEvent<MediaControlEventDetail<CameraControlAction>>,
  ): void => {
    event.stopPropagation();
    this._dispatch(event.detail.action);
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
