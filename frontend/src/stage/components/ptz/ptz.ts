import { html, LitElement, nothing, type PropertyValues } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import type { PtzDirection } from "../../../api/ptz";
import {
  PTZ_ERROR_TOAST_DURATION_MS,
  PTZ_TAG,
  TOAST_REGION_TAG,
} from "../../../core/constants";
import type { CameraSessionContext } from "../../camera-session-context";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import { renderIcon, type IconName } from "../../../ui/icons";
import { ToastManager } from "../../../ui/toast-manager";
import "../../../ui/toast-region";
import { PressInteractionController } from "../../../ui/press-interaction.controller";
import { roundButtonStyles } from "../../../ui/overlay-control.styles";
import { OverlayInteractionController } from "../../overlay-interaction.controller";
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
    expanded: { type: Boolean, reflect: true },
    initialState: { attribute: false },
    localize: { attribute: false },
  };

  private _activeDirection?: PtzDirection;
  private _lastCameraEntityId?: string;
  private _wasVisible = false;
  private readonly _overlay = new OverlayInteractionController(this);
  private readonly _press = new PressInteractionController<PtzDirection>(this, {
    actionFor: (target) => target.dataset.direction as PtzDirection,
    end: () => this._stop(),
    start: (direction) => this._start(direction),
  });
  private readonly _toasts = new ToastManager(this);
  private readonly _session = new PtzSessionController(this, {
    onFailure: () => this._showFailure(),
    onStopped: () => this._clearActiveDirection(),
  });

  public api?: HomeAssistantApi;
  public cameraSession?: CameraSessionContext;
  public cameras: readonly PtzCameraSource[] = [];
  public expanded = true;
  public initialState: "closed" | "open" = "open";
  public localize: LocalizeFunction = englishLocalize;

  protected willUpdate(changed: PropertyValues<this>): void {
    if (this.cameraSession)
      this._session.configure(this.api, this.cameraSession, this.cameras);
    const camera = this._session.camera;
    this._overlay.configure(camera);
    const visible =
      (camera?.overlayVisible ?? false) || this._activeDirection !== undefined;
    const cameraChanged = camera?.entityId !== this._lastCameraEntityId;
    if (
      cameraChanged ||
      changed.has("initialState") ||
      (this._wasVisible && !visible)
    ) {
      this.expanded = this.initialState === "open";
    }
    this._lastCameraEntityId = camera?.entityId;
    this._wasVisible = visible;
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
        class=${[
          this.expanded ? "ptz-control" : "ptz-trigger-wrap",
          visible ? "visible" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role=${this.expanded ? "group" : nothing}
        aria-label=${this.expanded ? this.localize("ptz.controls") : nothing}
        @pointerenter=${this._overlay.handlePointerEnter}
        @pointerleave=${this._overlay.handlePointerLeave}
        @focusin=${this._overlay.handleFocusIn}
        @focusout=${this._overlay.handleFocusOut}
      >
        ${
          this.expanded
            ? DIRECTIONS.map(({ direction, icon }) => {
                const supported =
                  direction === "left" || direction === "right"
                    ? capability.pan
                    : capability.tilt;
                return supported
                  ? html`<button
                      class=${`${direction} round-button`}
                      type="button"
                      data-direction=${direction}
                      aria-label=${this.localize(`ptz.${direction}`)}
                      @contextmenu=${this._preventDefault}
                      @pointerdown=${this._press.handlePointerDown}
                      @pointerup=${this._press.handlePointerUp}
                      @pointercancel=${this._press.handlePointerCancel}
                      @lostpointercapture=${this._press.handlePointerCancel}
                      @keydown=${this._press.handleKeyDown}
                      @keyup=${this._press.handleKeyUp}
                    >
                      ${renderIcon(icon)}
                    </button>`
                  : nothing;
              })
            : html`<button
                class="ptz-trigger round-button"
                type="button"
                aria-label=${this.localize("ptz.expand")}
                @click=${this._expand}
              >
                ${renderIcon("ptz")}
              </button>`
        }
        ${
          this.expanded
            ? html`<button
                class="collapse round-button"
                type="button"
                aria-label=${this.localize("ptz.collapse")}
                @click=${this._collapse}
              >
                ${renderIcon("arrowCollapseAll")}
              </button>`
            : nothing
        }
      </div>
    </div>`;
  }

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

  private readonly _expand = (): void => {
    this.expanded = true;
    this._overlay.reveal();
  };

  private readonly _collapse = (): void => {
    this.expanded = false;
    this._overlay.reveal();
  };

  private readonly _preventDefault = (event: Event): void =>
    event.preventDefault();

  static styles = [roundButtonStyles, ptzStyles];
}

if (!customElements.get(PTZ_TAG)) customElements.define(PTZ_TAG, PtzComponent);

declare global {
  interface HTMLElementTagNameMap {
    [PTZ_TAG]: PtzComponent;
  }
}
