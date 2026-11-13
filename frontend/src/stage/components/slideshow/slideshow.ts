import { html, LitElement, nothing, type PropertyValues } from "lit";

import { SLIDESHOW_TAG } from "../../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import { releaseTouchFocus } from "../../../ui/control-interaction";
import { renderIcon } from "../../../ui/icons";
import type {
  ActiveCameraSession,
  CameraSessionContext,
} from "../../camera-session-context";
import type {
  CameraSelectionContext,
  CameraSelectionState,
} from "../../camera-selection-context";
import { OverlayInteractionController } from "../../overlay-interaction.controller";
import { slideshowStyles } from "./slideshow.styles";

const EMPTY_STATE: CameraSelectionState = { items: [] };

/** Persistent-when-active slideshow countdown for Camera's overlay slot. */
export class SlideshowComponent extends LitElement {
  public static properties = {
    cameraSelection: { attribute: false },
    cameraSession: { attribute: false },
    localize: { attribute: false },
    targetModuleId: { attribute: false },
  };

  public cameraSelection?: CameraSelectionContext;
  public cameraSession?: CameraSessionContext;
  public localize: LocalizeFunction = englishLocalize;
  public targetModuleId = "";

  private _activeCamera?: ActiveCameraSession;
  private _cameraSessionContext?: CameraSessionContext;
  private readonly _overlay = new OverlayInteractionController(this);
  private _state = EMPTY_STATE;
  private _unsubscribeCamera?: () => void;
  private _unsubscribeSelection?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._bindContexts();
  }

  public disconnectedCallback(): void {
    this._unsubscribeCamera?.();
    this._unsubscribeSelection?.();
    this._unsubscribeCamera = undefined;
    this._unsubscribeSelection = undefined;
    this._cameraSessionContext = undefined;
    super.disconnectedCallback();
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (
      changed.has("cameraSelection") ||
      changed.has("cameraSession") ||
      changed.has("targetModuleId")
    ) {
      this._bindContexts();
    }
    this._overlay.configure(this._activeCamera);
  }

  protected render() {
    if (!this._state.slideshowAvailable || !this._activeCamera) return nothing;
    const active = this._state.slideshowEnabled === true;
    const held = active && this._state.slideshowHeld === true;
    const overlayVisible = this._activeCamera.overlayVisible;
    const visible = active || overlayVisible;
    const seconds = this._state.slideshowRemainingSeconds ?? 0;
    const label = held
      ? this.localize("camera.slideshow_resume")
      : active
        ? this.localize("camera.slideshow_disable_remaining", { seconds })
        : this.localize("camera.slideshow_enable");
    return html`<button
      class=${[
        "wzc-media-overlay-button",
        visible ? "visible" : "",
        active ? "active" : "",
        active && !overlayVisible ? "dimmed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      type="button"
      aria-label=${label}
      aria-pressed=${active ? "true" : "false"}
      title=${label}
      @click=${this._toggle}
      @pointerdown=${this._handlePointerDown}
      @pointerenter=${this._overlay.handlePointerEnter}
      @pointerleave=${this._overlay.handlePointerLeave}
      @pointerup=${releaseTouchFocus}
      @focusin=${this._overlay.handleFocusIn}
      @focusout=${this._overlay.handleFocusOut}
    >
      ${renderIcon("presentationPlay")}
      ${
        active
          ? html`<span class="status"
              >${
                held
                  ? this.localize("camera.slideshow_hold")
                  : this.localize("camera.slideshow_seconds", { seconds })
              }</span
            >`
          : nothing
      }
    </button>`;
  }

  private _bindContexts(): void {
    if (this._cameraSessionContext !== this.cameraSession) {
      this._unsubscribeCamera?.();
      this._cameraSessionContext = this.cameraSession;
      this._unsubscribeCamera = this.cameraSession?.subscribe((camera) => {
        this._activeCamera = camera;
        this.requestUpdate();
      });
    }
    this._unsubscribeSelection?.();
    this._unsubscribeSelection = undefined;
    this._state = EMPTY_STATE;
    if (!this.cameraSelection || !this.targetModuleId) return;
    this._unsubscribeSelection = this.cameraSelection.subscribe(
      this.targetModuleId,
      (state) => {
        this._state = state;
        this.requestUpdate();
      },
    );
  }

  private readonly _handlePointerDown = (event: PointerEvent): void => {
    event.stopPropagation();
    this._overlay.reveal();
  };

  private readonly _toggle = (): void => {
    this.cameraSelection?.toggleSlideshow(this.targetModuleId);
  };

  static styles = slideshowStyles;
}

if (!customElements.get(SLIDESHOW_TAG)) {
  customElements.define(SLIDESHOW_TAG, SlideshowComponent);
}

declare global {
  interface HTMLElementTagNameMap {
    [SLIDESHOW_TAG]: SlideshowComponent;
  }
}
