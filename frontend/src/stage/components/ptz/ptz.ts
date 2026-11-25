import { html, LitElement, nothing, type PropertyValues } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import type { PtzCapability, PtzDirection } from "../../../api/ptz";
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
import { releaseTouchFocus } from "../../../ui/controls/control-interaction";
import { renderIcon, type IconName } from "../../../ui/icons";
import { ToastManager } from "../../../ui/toast/manager";
import { PressInteractionController } from "../../../ui/press";
import { roundButtonStyles } from "../../../ui/controls/overlay-control.styles";
import { OverlayInteractionController } from "../../overlay-interaction.controller";
import {
  PtzSessionController,
  type PtzCameraSource,
} from "./session.controller";
import { ptzStyles } from "./ptz.styles";
import {
  motionDurations,
  motionEasings,
  OwnedMotion,
  VisibilityMotion,
} from "../../../ui/motion";

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
    presentation: { reflect: true },
  };

  private _activeDirection?: PtzDirection;
  private _activePreset?: string;
  private _lastCameraEntityId?: string;
  private _userToggled = false;
  private readonly _overlay = new OverlayInteractionController(this);
  private readonly _press = new PressInteractionController<PtzDirection>(this, {
    actionFor: (target) => target.dataset.direction as PtzDirection,
    end: () => this._stop(),
    start: (direction) => this._start(direction),
  });
  private readonly _toasts = new ToastManager(this);
  private readonly _controlVisibilityMotion = new VisibilityMotion();
  private readonly _triggerVisibilityMotion = new VisibilityMotion();
  private readonly _panelMotion = new OwnedMotion();
  private readonly _session = new PtzSessionController(this, {
    onFailure: (operation) => this._showFailure(operation),
    onStopped: () => this._clearActiveDirection(),
  });

  public api?: HomeAssistantApi;
  public cameraSession?: CameraSessionContext;
  public cameras: readonly PtzCameraSource[] = [];
  public expanded = true;
  public initialState: "closed" | "open" = "open";
  public localize: LocalizeFunction = englishLocalize;
  public presentation: "overlay" | "panel" = "overlay";

  protected willUpdate(changed: PropertyValues<this>): void {
    if (this.cameraSession)
      this._session.configure(this.api, this.cameraSession, this.cameras);
    const camera = this._session.camera;
    this._overlay.configure(camera);
    const cameraEntityId = camera?.entityId;
    const cameraChanged =
      cameraEntityId !== undefined &&
      cameraEntityId !== this._lastCameraEntityId;
    if (cameraChanged || changed.has("initialState")) {
      this._userToggled = false;
      this.expanded = this.initialState === "open";
    }
    if (cameraEntityId !== undefined) this._lastCameraEntityId = cameraEntityId;
  }

  protected render() {
    const camera = this._session.camera;
    const capability = this._session.capability;
    if (!camera || !capability?.supported) return nothing;
    if (this.presentation === "panel") {
      return this._renderPanel(capability);
    }
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
          "ptz-control",
          "circle-pad",
          this.expanded ? "expanded" : "collapsed",
          this._userToggled ? "user-toggled" : "",
          visible ? "visible" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role=${this.expanded ? "group" : nothing}
        aria-hidden=${this.expanded && visible ? "false" : "true"}
        aria-label=${this.expanded ? this.localize("ptz.controls") : nothing}
        ?inert=${!this.expanded || !visible}
        @pointerenter=${this._overlay.handlePointerEnter}
        @pointerleave=${this._overlay.handlePointerLeave}
        @pointerdown=${this._stopPropagation}
        @focusin=${this._overlay.handleFocusIn}
        @focusout=${this._overlay.handleFocusOut}
      >
        ${this._renderPad(capability, "overlay")}
      </div>
      ${
        !this.expanded
          ? html`<button
              class=${[
                "ptz-trigger",
                "round-button",
                this._userToggled ? "user-toggled" : "",
                visible ? "visible" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              aria-hidden=${visible ? "false" : "true"}
              aria-label=${this.localize("ptz.expand")}
              ?inert=${!visible}
              @pointerenter=${this._overlay.handlePointerEnter}
              @pointerleave=${this._overlay.handlePointerLeave}
              @pointerdown=${this._stopPropagation}
              @pointerup=${releaseTouchFocus}
              @click=${this._toggleExpanded}
            >
              ${renderIcon("ptz")}
            </button>`
          : nothing
      }
    </div>`;
  }

  protected updated(changed: PropertyValues<this>): void {
    if (this.presentation === "panel") return;
    const control =
      this.renderRoot.querySelector<HTMLElement>(".ptz-control") ?? undefined;
    const trigger =
      this.renderRoot.querySelector<HTMLElement>(".ptz-trigger") ?? undefined;
    this._controlVisibilityMotion.update(
      control,
      control?.classList.contains("visible") ?? false,
    );
    this._triggerVisibilityMotion.update(
      trigger,
      trigger?.classList.contains("visible") ?? false,
    );
    if (control && changed.has("expanded") && this._userToggled) {
      const fromSize = this.expanded
        ? "var(--wzc-control-size)"
        : "var(--wzc-ptz-panel-size)";
      const toSize = this.expanded
        ? "var(--wzc-ptz-panel-size)"
        : "var(--wzc-control-size)";
      this._panelMotion.start(
        control,
        {
          blockSize: [fromSize, toSize],
          inlineSize: [fromSize, toSize],
        },
        { duration: motionDurations.overlay, ease: motionEasings.standard },
      );
    }
  }

  public disconnectedCallback(): void {
    this._controlVisibilityMotion.disconnect();
    this._triggerVisibilityMotion.disconnect();
    this._panelMotion.cancel();
    super.disconnectedCallback();
  }

  private readonly _handleDirectionPointerUp = (event: PointerEvent): void => {
    this._press.handlePointerUp(event);
    releaseTouchFocus(event);
  };

  private readonly _handleDirectionPointerCancel = (
    event: PointerEvent,
  ): void => {
    this._press.handlePointerCancel(event);
    releaseTouchFocus(event);
  };

  private _start(direction: PtzDirection): void {
    if (this._activeDirection === direction) return;
    this._activeDirection = direction;
    this.requestUpdate();
    void this._session.start(direction, this.presentation === "overlay");
  }

  private _stop(): void {
    if (!this._activeDirection) return;
    this._activeDirection = undefined;
    this._session.stop();
    this.requestUpdate();
  }

  private _showFailure(operation: "motion" | "preset"): void {
    this._activeDirection = undefined;
    this._activePreset = undefined;
    this._toasts.error(
      this.localize(
        operation === "preset" ? "ptz.preset_failed" : "ptz.failed",
      ),
      {
        durationMs: PTZ_ERROR_TOAST_DURATION_MS,
        key: "ptz-status",
      },
    );
    this.requestUpdate();
  }

  private _clearActiveDirection(): void {
    if (!this._activeDirection) return;
    this._activeDirection = undefined;
    this.requestUpdate();
  }

  private readonly _toggleExpanded = (): void => {
    this._overlay.reveal();
    this._userToggled = true;
    this.expanded = !this.expanded;
  };

  private _renderPanel(capability: PtzCapability) {
    const presets = capability.presets.slice(0, 6);
    return staticHtml`<div class="ptz-panel-presentation">
      <${toastRegionTag}
        class="ptz-panel-toast"
        mode="inline"
        .notices=${this._toasts.notices}
      ></${toastRegionTag}>
      <div
        class="ptz-panel-directional circle-pad"
        role="group"
        aria-label=${this.localize("ptz.controls")}
      >
        ${this._renderPad(capability, "panel")}
      </div>
      ${
        presets.length > 0
          ? html`<div class="ptz-presets">
              ${presets.map(
                (preset) =>
                  html`<button
                    class="ptz-preset"
                    type="button"
                    title=${preset}
                    aria-label=${this.localize("ptz.preset", { preset })}
                    ?disabled=${this._activePreset !== undefined}
                    @pointerup=${releaseTouchFocus}
                    @click=${() => void this._recallPreset(preset)}
                  >
                    ${preset}
                  </button>`,
              )}
            </div>`
          : nothing
      }
    </div>`;
  }

  private _renderPad(
    capability: PtzCapability,
    presentation: "overlay" | "panel",
  ) {
    return html`${DIRECTIONS.map(({ direction, icon }) => {
      const supported =
        direction === "left" || direction === "right"
          ? capability.pan
          : capability.tilt;
      return supported
        ? html`<button
            class=${`${direction} direction wedge`}
            type="button"
            data-direction=${direction}
            aria-label=${this.localize(`ptz.${direction}`)}
            ?disabled=${presentation === "overlay" && !this.expanded}
            tabindex=${presentation === "overlay" && !this.expanded ? "-1" : "0"}
            @contextmenu=${this._preventDefault}
            @pointerdown=${this._press.handlePointerDown}
            @pointerup=${this._handleDirectionPointerUp}
            @pointercancel=${this._handleDirectionPointerCancel}
            @lostpointercapture=${this._press.handlePointerCancel}
            @keydown=${this._press.handleKeyDown}
            @keyup=${this._press.handleKeyUp}
          >
            ${renderIcon(icon)}
          </button>`
        : nothing;
    })}
    ${
      presentation === "overlay"
        ? html`<button
            class="center-toggle"
            type="button"
            aria-label=${this.localize("ptz.collapse")}
            ?disabled=${!this.expanded}
            tabindex=${this.expanded ? "0" : "-1"}
            @click=${this._toggleExpanded}
            @pointerup=${releaseTouchFocus}
          >
            ${renderIcon("ptz")}
          </button>`
        : html`<div class="center-hub">
            ${this._renderZoomButton("zoom_in", "+")}
            ${this._renderZoomButton("zoom_out", "−")}
          </div>`
    }`;
  }

  private _renderZoomButton(direction: "zoom_in" | "zoom_out", label: string) {
    return html`<button
      class=${`center-half ${direction === "zoom_in" ? "top" : "bottom"}`}
      type="button"
      data-direction=${direction}
      aria-label=${this.localize(
        direction === "zoom_in" ? "ptz.zoom_in" : "ptz.zoom_out",
      )}
      @contextmenu=${this._preventDefault}
      @pointerdown=${this._press.handlePointerDown}
      @pointerup=${this._handleDirectionPointerUp}
      @pointercancel=${this._handleDirectionPointerCancel}
      @lostpointercapture=${this._press.handlePointerCancel}
      @keydown=${this._press.handleKeyDown}
      @keyup=${this._press.handleKeyUp}
    >
      ${label}
    </button>`;
  }

  private async _recallPreset(preset: string): Promise<void> {
    if (this._activePreset !== undefined) return;
    this._activePreset = preset;
    this.requestUpdate();
    await this._session.recallPreset(preset);
    if (this._activePreset !== preset) return;
    this._activePreset = undefined;
    this.requestUpdate();
  }

  private readonly _preventDefault = (event: Event): void =>
    event.preventDefault();

  private readonly _stopPropagation = (event: Event): void =>
    event.stopPropagation();

  static styles = [roundButtonStyles, ptzStyles];
}

if (!customElements.get(PTZ_TAG)) customElements.define(PTZ_TAG, PtzComponent);

declare global {
  interface HTMLElementTagNameMap {
    [PTZ_TAG]: PtzComponent;
  }
}
