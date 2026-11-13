import { html, LitElement, nothing, type PropertyValues } from "lit";

import { CAMERA_SWITCHER_TAG } from "../../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
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
import { cameraSwitcherStyles } from "./camera-switcher.styles";

const MENU_ID = "camera-switcher-options";

/** Optional top-center selector for the camera module's active camera. */
export class CameraSwitcherComponent extends LitElement {
  public static properties = {
    cameraSelection: { attribute: false },
    cameraSession: { attribute: false },
    localize: { attribute: false },
    targetModuleId: { attribute: false },
  };

  private _activeCamera?: ActiveCameraSession;
  private _cameraSessionContext?: CameraSessionContext;
  private _open = false;
  private _releaseOpenHold?: () => void;
  private _selectionState: CameraSelectionState = { items: [] };
  private _unsubscribeCamera?: () => void;
  private _unsubscribeSelection?: () => void;
  private readonly _overlay = new OverlayInteractionController(this);

  public cameraSelection?: CameraSelectionContext;
  public cameraSession?: CameraSessionContext;
  public localize: LocalizeFunction = englishLocalize;
  public targetModuleId = "";

  public connectedCallback(): void {
    super.connectedCallback();
    this._bindContexts();
  }

  public disconnectedCallback(): void {
    this._close();
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
    if (this._selectionState.items.length <= 1 || !this._activeCamera) {
      return nothing;
    }
    const active = this._selectionState.items.find(
      ({ entityId }) =>
        entityId ===
        (this._selectionState.activeSelectionId ??
          this._selectionState.activeEntityId),
    );
    const visible = this._activeCamera.overlayVisible || this._open;
    return html`<div
      class=${["switcher", visible ? "visible" : "", this._open ? "open" : ""]
        .filter(Boolean)
        .join(" ")}
      @pointerenter=${this._overlay.handlePointerEnter}
      @pointerleave=${this._overlay.handlePointerLeave}
      @pointerdown=${this._stopPropagation}
      @focusin=${this._overlay.handleFocusIn}
      @focusout=${this._overlay.handleFocusOut}
      @keydown=${this._handleKeyDown}
    >
      <button
        class="trigger"
        type="button"
        aria-controls=${MENU_ID}
        aria-expanded=${this._open ? "true" : "false"}
        aria-haspopup="listbox"
        aria-label=${this.localize("camera.select")}
        @click=${this._toggle}
      >
        <span>${active?.label ?? this.localize("camera.switcher")}</span>
        ${renderIcon("chevronDown")}
      </button>
      ${
        this._open
          ? html`<div
              class="options"
              id=${MENU_ID}
              role="listbox"
              aria-label=${this.localize("camera.switcher")}
            >
              ${this._selectionState.items.map(
                ({ entityId, label }) =>
                  html`<button
                    class=${
                      entityId === active?.entityId
                        ? "option selected"
                        : "option"
                    }
                    type="button"
                    role="option"
                    aria-selected=${
                      entityId === active?.entityId ? "true" : "false"
                    }
                    data-entity-id=${entityId}
                    @click=${this._select}
                  >
                    ${label}
                  </button>`,
              )}
            </div>`
          : nothing
      }
    </div>`;
  }

  private _bindContexts(): void {
    if (this._cameraSessionContext !== this.cameraSession) {
      this._unsubscribeCamera?.();
      this._cameraSessionContext = this.cameraSession;
      this._unsubscribeCamera = this.cameraSession?.subscribe((camera) => {
        if (camera?.entityId !== this._activeCamera?.entityId) this._close();
        this._activeCamera = camera;
        this.requestUpdate();
      });
    }

    this._unsubscribeSelection?.();
    this._unsubscribeSelection = undefined;
    if (!this.cameraSelection || !this.targetModuleId) {
      this._selectionState = { items: [] };
      return;
    }
    this._unsubscribeSelection = this.cameraSelection.subscribe(
      this.targetModuleId,
      (state) => {
        this._selectionState = state;
        this.requestUpdate();
      },
    );
  }

  private readonly _toggle = (): void => {
    if (this._open) this._close();
    else this._openMenu();
  };

  private _openMenu(): void {
    if (this._open) return;
    this._open = true;
    this._releaseOpenHold = this._activeCamera?.holdOverlay();
    this._overlay.reveal();
    window.addEventListener("pointerdown", this._handleOutsidePointerDown);
    this.requestUpdate();
  }

  private _close(): void {
    if (!this._open && !this._releaseOpenHold) return;
    this._open = false;
    this._releaseOpenHold?.();
    this._releaseOpenHold = undefined;
    window.removeEventListener("pointerdown", this._handleOutsidePointerDown);
    this.requestUpdate();
  }

  private readonly _select = (event: Event): void => {
    const entityId = (event.currentTarget as HTMLElement).dataset.entityId;
    if (entityId) {
      this.cameraSelection?.select(this.targetModuleId, entityId);
    }
    this._close();
  };

  private readonly _handleOutsidePointerDown = (event: PointerEvent): void => {
    if (event.composedPath().includes(this)) return;
    this._close();
  };

  private readonly _handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this._open) return;
    event.preventDefault();
    this._close();
    this.shadowRoot?.querySelector<HTMLButtonElement>(".trigger")?.focus();
  };

  private readonly _stopPropagation = (event: Event): void => {
    event.stopPropagation();
  };

  static styles = cameraSwitcherStyles;
}

if (!customElements.get(CAMERA_SWITCHER_TAG)) {
  customElements.define(CAMERA_SWITCHER_TAG, CameraSwitcherComponent);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_SWITCHER_TAG]: CameraSwitcherComponent;
  }
}
