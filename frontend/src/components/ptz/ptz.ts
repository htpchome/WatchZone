import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import type { PtzDirection } from "../../api/ptz";
import {
  PTZ_ERROR_TOAST_DURATION_MS,
  PTZ_TAG,
  TOAST_REGION_TAG,
} from "../../core/constants";
import type { CameraSessionContext } from "../../core/camera-session-context";
import type { HomeAssistantApi } from "../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { renderIcon, type IconName } from "../../ui/icons";
import { ToastManager } from "../../ui/toast-manager";
import "../../ui/toast-region";
import {
  PtzSessionController,
  type PtzCameraSource,
} from "./session.controller";
import { ptzStyles } from "./ptz.styles";

const toastRegionTag = unsafeStatic(TOAST_REGION_TAG);
const DIRECTIONS: readonly {
  readonly direction: PtzDirection;
  readonly icon: IconName;
}[] = [
  { direction: "up", icon: "chevronUp" },
  { direction: "left", icon: "chevronLeft" },
  { direction: "right", icon: "chevronRight" },
  { direction: "down", icon: "chevronDown" },
];

/** Independently placeable PTZ presentation for the active camera. */
export class PtzComponent extends LitElement {
  public static properties = {
    api: { attribute: false },
    cameraSession: { attribute: false },
    cameras: { attribute: false },
    localize: { attribute: false },
  };

  private _activeDirection?: PtzDirection;
  private _interactionFocused = false;
  private _interactionHovered = false;
  private _interactionCameraId?: string;
  private _releaseInteractionOverlay?: () => void;
  private readonly _toasts = new ToastManager(this);
  private readonly _session = new PtzSessionController(this, {
    onFailure: () => this._showFailure(),
    onStopped: () => this._clearActiveDirection(),
  });

  public api?: HomeAssistantApi;
  public cameraSession?: CameraSessionContext;
  public cameras: readonly PtzCameraSource[] = [];
  public localize: LocalizeFunction = englishLocalize;

  protected willUpdate(): void {
    if (this.cameraSession)
      this._session.configure(this.api, this.cameraSession, this.cameras);
    if (
      this._interactionCameraId &&
      this._interactionCameraId !== this._session.camera?.entityId
    ) {
      this._releaseInteractionHold();
    }
  }

  public disconnectedCallback(): void {
    this._releaseInteractionHold();
    super.disconnectedCallback();
  }

  protected render() {
    const camera = this._session.camera;
    const capability = this._session.capability;
    if (!camera || !capability?.supported) return nothing;
    const visible =
      camera.overlayVisible || this._activeDirection !== undefined;
    return staticHtml`<div class="ptz-layer">
      <${toastRegionTag}
        class="ptz-toast"
        mode="overlay"
        .notices=${this._toasts.notices}
      ></${toastRegionTag}>
      <div
        class=${visible ? "ptz-control visible" : "ptz-control"}
        role="group"
        aria-label=${this.localize("ptz.controls")}
        @pointerenter=${this._handleInteractionPointerEnter}
        @pointerleave=${this._handleInteractionPointerLeave}
        @focusin=${this._handleInteractionFocusIn}
        @focusout=${this._handleInteractionFocusOut}
      >
        ${DIRECTIONS.map(({ direction, icon }) => {
          const supported =
            direction === "left" || direction === "right"
              ? capability.pan
              : capability.tilt;
          return supported
            ? html`<button
                class=${direction}
                type="button"
                data-direction=${direction}
                aria-label=${this.localize(`ptz.${direction}`)}
                @contextmenu=${this._preventDefault}
                @pointerdown=${this._handlePointerDown}
                @pointerup=${this._handlePointerEnd}
                @pointercancel=${this._handlePointerEnd}
                @lostpointercapture=${this._handlePointerEnd}
                @keydown=${this._handleKeyDown}
                @keyup=${this._handleKeyUp}
              >
                ${renderIcon(icon)}
              </button>`
            : nothing;
        })}
      </div>
    </div>`;
  }

  private readonly _handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget as HTMLButtonElement;
    button.setPointerCapture(event.pointerId);
    this._start(button.dataset.direction as PtzDirection);
  };

  private readonly _handlePointerEnd = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this._stop();
  };

  private readonly _handleKeyDown = (event: KeyboardEvent): void => {
    if ((event.key !== " " && event.key !== "Enter") || event.repeat) return;
    event.preventDefault();
    this._start(
      (event.currentTarget as HTMLButtonElement).dataset
        .direction as PtzDirection,
    );
  };

  private readonly _handleKeyUp = (event: KeyboardEvent): void => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    this._stop();
  };

  private _start(direction: PtzDirection): void {
    if (this._activeDirection === direction) return;
    this._activeDirection = direction;
    this.requestUpdate();
    void this._session.start(direction);
  }

  private _stop(): void {
    if (!this._activeDirection) return;
    this._activeDirection = undefined;
    this._session.stop();
    this.requestUpdate();
  }

  private _showFailure(): void {
    this._activeDirection = undefined;
    this._toasts.error(this.localize("ptz.failed"), {
      durationMs: PTZ_ERROR_TOAST_DURATION_MS,
      key: "ptz-status",
    });
    this.requestUpdate();
  }

  private _clearActiveDirection(): void {
    if (!this._activeDirection) return;
    this._activeDirection = undefined;
    this.requestUpdate();
  }

  private readonly _handleInteractionPointerEnter = (
    event: PointerEvent,
  ): void => {
    if (event.pointerType === "touch") return;
    this._interactionHovered = true;
    this._syncInteractionHold();
  };

  private readonly _handleInteractionPointerLeave = (): void => {
    this._interactionHovered = false;
    this._syncInteractionHold();
  };

  private readonly _handleInteractionFocusIn = (): void => {
    this._interactionFocused = true;
    this._syncInteractionHold();
  };

  private _syncInteractionHold(): void {
    if (!this._interactionFocused && !this._interactionHovered) {
      this._releaseInteractionOverlay?.();
      this._releaseInteractionOverlay = undefined;
      this._interactionCameraId = undefined;
      return;
    }
    if (this._releaseInteractionOverlay) {
      this._session.camera?.revealOverlay();
      return;
    }
    const camera = this._session.camera;
    if (!camera) return;
    this._interactionCameraId = camera.entityId;
    this._releaseInteractionOverlay = camera.holdOverlay();
    camera.revealOverlay();
  }

  private readonly _releaseInteractionHold = (): void => {
    this._releaseInteractionOverlay?.();
    this._releaseInteractionOverlay = undefined;
    this._interactionCameraId = undefined;
    this._interactionFocused = false;
    this._interactionHovered = false;
  };

  private readonly _handleInteractionFocusOut = (event: FocusEvent): void => {
    const group = event.currentTarget as HTMLElement;
    if (group.contains(event.relatedTarget as Node | null)) return;
    this._interactionFocused = false;
    this._syncInteractionHold();
  };
  private readonly _preventDefault = (event: Event): void =>
    event.preventDefault();

  static styles = ptzStyles;
}

if (!customElements.get(PTZ_TAG)) customElements.define(PTZ_TAG, PtzComponent);

declare global {
  interface HTMLElementTagNameMap {
    [PTZ_TAG]: PtzComponent;
  }
}
