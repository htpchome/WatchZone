import { css, html, LitElement, nothing, type TemplateResult } from "lit";

import {
  detectDeviceProfile,
  type DeviceClass,
} from "../../core/device-profile";
import { renderIcon, type WatchZoneIcon } from "../../ui/icons";

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
): WatchZoneIcon {
  if (action === "suspend") return "power";
  if (action === "picture_in_picture") return "pipPopOut";
  if (action === "snapshot") return "takeSnapshot";
  if (action === "fullscreen") {
    return fullscreenActive ? "fullscreenExit" : "fullscreen";
  }
  return muted ? "volumeOff" : "volumeOn";
}

export class WatchZoneCameraControls extends LitElement {
  public static properties = {
    errorMessage: { attribute: false },
    fullscreenActive: { attribute: false, type: Boolean },
    fullscreenSupported: { attribute: false, type: Boolean },
    muted: { attribute: false, type: Boolean },
    pictureInPictureActive: { attribute: false, type: Boolean },
    pictureInPictureSupported: { attribute: false, type: Boolean },
  };

  public errorMessage?: string;
  public fullscreenActive = false;
  public fullscreenSupported = false;
  public muted = true;
  public pictureInPictureActive = false;
  public pictureInPictureSupported = false;

  private readonly _deviceProfile = detectDeviceProfile();

  protected render() {
    return html`
      <div class="control-group" role="toolbar" aria-label="Camera controls">
        ${CONTROLS.filter((control) =>
          CAMERA_CONTROL_DEVICE_MATRIX[control.action].includes(
            this._deviceProfile.deviceClass,
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

  static styles = css`
    :host {
      position: absolute;
      z-index: 2;
      inset: 0;
      display: block;
      overflow: hidden;
      pointer-events: none;
      container-type: size;

      --wzc-control-size: 2.75rem;
      --wzc-control-icon-size: 1.65rem;
      --wzc-control-gap: 0.3rem;
      --wzc-control-safe-inline: 0.75rem;
    }

    .control-group {
      position: absolute;
      inset-block-start: 50%;
      inset-inline-end: calc(
        var(--wzc-control-safe-inline) + env(safe-area-inset-right, 0px)
      );
      display: flex;
      flex-direction: column;
      gap: var(--wzc-control-gap);
      transform: translateY(-50%);
      pointer-events: auto;
    }

    .control-button {
      display: grid;
      place-items: center;
      box-sizing: border-box;
      inline-size: var(--wzc-control-size);
      block-size: var(--wzc-control-size);
      min-inline-size: 0;
      min-block-size: 0;
      padding: 0;
      color: var(
        --wzc-control-color,
        var(--card-background-color, var(--primary-background-color, Canvas))
      );
      background: var(
        --wzc-control-background,
        color-mix(
          in srgb,
          var(--primary-text-color, CanvasText) 82%,
          transparent
        )
      );
      border: 1px solid
        var(
          --wzc-control-border-color,
          var(--divider-color, color-mix(in srgb, CanvasText 24%, transparent))
        );
      border-radius: var(--wzc-control-radius, 0.25rem);
      box-shadow: var(--wzc-control-shadow, var(--ha-card-box-shadow, none));
      font: inherit;
      cursor: pointer;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }

    .control-button:hover:not(:disabled) {
      background: var(--wzc-control-hover-background, var(--primary-color));
      color: var(--wzc-control-hover-color, var(--text-primary-color, Canvas));
    }

    .control-button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 1px;
    }

    .control-button:disabled {
      opacity: var(--wzc-control-disabled-opacity, 1);
      cursor: default;
    }

    svg {
      inline-size: var(--wzc-control-icon-size);
      block-size: var(--wzc-control-icon-size);
      overflow: visible;
      fill: currentColor;
    }

    .control-error {
      position: absolute;
      inset-block-end: max(0.75rem, env(safe-area-inset-bottom, 0px));
      inset-inline: 0.75rem;
      max-inline-size: max-content;
      margin-inline: auto;
      padding: 0.375rem 0.625rem;
      color: var(--ha-color-text-error, var(--error-color));
      background: var(--card-background-color, var(--primary-background-color));
      border: 1px solid var(--ha-color-border-danger-quiet, var(--error-color));
      border-radius: var(--ha-border-radius-pill, 999px);
      font-size: 0.75rem;
      pointer-events: none;
    }

    @container (max-width: 480px) {
      .control-group {
        --wzc-control-size: 2.35rem;
        --wzc-control-icon-size: 1.4rem;
      }
    }

    @container (max-height: 360px) {
      .control-group {
        --wzc-control-size: 2.25rem;
        --wzc-control-icon-size: 1.3rem;
        --wzc-control-gap: 0.125rem;
      }
    }

    @container (max-height: 240px) {
      .control-group {
        --wzc-control-size: 1.875rem;
        --wzc-control-icon-size: 1.15rem;
        --wzc-control-gap: 0.1rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .control-button {
        transition: none;
      }
    }
  `;
}

if (!customElements.get("watchzone-camera-controls")) {
  customElements.define("watchzone-camera-controls", WatchZoneCameraControls);
}

declare global {
  interface HTMLElementTagNameMap {
    "watchzone-camera-controls": WatchZoneCameraControls;
  }
}
