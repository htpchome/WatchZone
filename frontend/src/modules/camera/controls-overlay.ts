import { css, html, LitElement, nothing, type TemplateResult } from "lit";

import {
  detectDeviceProfile,
  type DeviceClass,
} from "../../core/device-profile";

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

function icon(action: CameraControlAction, muted: boolean): TemplateResult {
  if (action === "suspend") {
    return html`<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v8m-5.7-5a8 8 0 1 0 11.4 0"></path>
    </svg>`;
  }
  if (action === "picture_in_picture") {
    return html`<svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="14" rx="2"></rect>
      <rect x="12" y="12" width="9" height="7" rx="1"></rect>
      <path d="m6 8 5 4m0-4v4H7"></path>
    </svg>`;
  }
  if (action === "snapshot") {
    return html`<svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 8h4l1.5-2h5L16 8h4a2 2 0 0 1 2 2v9H2v-9a2 2 0 0 1 2-2Z"
      ></path>
      <circle cx="12" cy="13.5" r="3.5"></circle>
      <path d="M5 3v4M3 5h4"></path>
    </svg>`;
  }
  if (action === "fullscreen") {
    return html`<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5"></path>
    </svg>`;
  }
  return html`<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 9H2v6h3l5 4V5L5 9Zm9.5 1.5a4 4 0 0 1 0 3"></path>
    ${muted ? html`<path d="m3 3 18 18"></path>` : nothing}
  </svg>`;
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
      ${icon(control.action, this.muted)}
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
      --wzc-control-gap: 0.25rem;
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
      padding: var(--wzc-control-gap);
      background: color-mix(
        in srgb,
        var(
            --wzc-control-group-background,
            var(--card-background-color, var(--primary-background-color))
          )
          72%,
        transparent
      );
      border: 1px solid var(--wzc-control-border-color, var(--divider-color));
      border-radius: var(--wzc-control-group-radius, 0.5rem);
      box-shadow: var(--ha-card-box-shadow, none);
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
      color: var(--wzc-control-color, var(--primary-text-color));
      background: var(--wzc-control-background, transparent);
      border: 0;
      border-radius: var(--wzc-control-radius, 0.375rem);
      font: inherit;
      cursor: pointer;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }

    .control-button:hover:not(:disabled) {
      background: var(
        --wzc-control-hover-background,
        var(--secondary-background-color)
      );
    }

    .control-button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 1px;
    }

    .control-button[aria-pressed="true"] {
      color: var(--wzc-control-active-color, var(--primary-color));
      background: var(
        --wzc-control-active-background,
        var(--secondary-background-color)
      );
    }

    .control-button:disabled {
      opacity: var(--wzc-control-disabled-opacity, 0.45);
      cursor: default;
    }

    svg {
      inline-size: var(--wzc-control-icon-size);
      block-size: var(--wzc-control-icon-size);
      overflow: visible;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
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
