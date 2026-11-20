import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  TALK_ERROR_TOAST_DURATION_MS,
  TALK_SUCCESS_TOAST_DURATION_MS,
  TALK_TAG,
  TOAST_REGION_TAG,
} from "../../../core/constants";
import type { CameraSessionContext } from "../../camera-session-context";
import type { LiveConnectionType } from "../../../core/config";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import { roundButtonStyles } from "../../../ui/overlay-control.styles";
import { renderIcon } from "../../../ui/icons";
import { ToastManager } from "../../../ui/toast-manager";
import { PressInteractionController } from "../../../ui/press-interaction.controller";
import "../../../ui/toast-region";
import type { TalkConnection } from "../../../providers/talk-source-resolver";
import { OverlayInteractionController } from "../../overlay-interaction.controller";
import { TalkSessionController } from "./session.controller";
import { TalkSoundwaveController } from "./soundwave.controller";
import { twoWayTalkStyles } from "./two-way-talk.styles";
import {
  OwnedMotion,
  reducedMotionRequested,
  VisibilityMotion,
} from "../../../ui/motion";

const toastRegionTag = unsafeStatic(TOAST_REGION_TAG);
const TALK_TOAST_KEY = "two-way-talk-status";
type TalkControlAction = "connect" | "microphone" | "speaker" | "stop";

/** User-placeable two-way-talk presentation over the active camera. */
export class TwoWayTalkComponent extends LitElement {
  public static properties = {
    api: { attribute: false },
    cameraSession: { attribute: false },
    cameras: { attribute: false },
    localize: { attribute: false },
    presentation: { reflect: true },
  };

  private readonly _toasts = new ToastManager(this);
  private readonly _soundwave = new TalkSoundwaveController();
  private readonly _overlay = new OverlayInteractionController(this);
  private readonly _press = new PressInteractionController<TalkControlAction>(
    this,
    {
      actionFor: (target) =>
        target.dataset.talkAction as TalkControlAction | undefined,
      start: () => undefined,
      end: (action, cancelled) => {
        if (!cancelled) this._activate(action);
      },
    },
  );
  private _talkStream?: MediaStream;
  private readonly _visibilityMotion = new VisibilityMotion();
  private readonly _spinnerMotion = new OwnedMotion();
  private _spinnerElement?: HTMLElement;
  private readonly _session = new TalkSessionController(this, {
    onConnected: (connection) => this._handleConnected(connection),
    onFailed: () => this._handleFailed(),
    onStopped: () => this._handleStopped(),
  });

  public api?: HomeAssistantApi;
  public cameraSession?: CameraSessionContext;
  public cameras: readonly {
    readonly connection: LiveConnectionType;
    readonly entityId: string;
  }[] = [];
  public localize: LocalizeFunction = englishLocalize;
  public presentation: "overlay" | "toolbar" = "overlay";

  protected willUpdate(): void {
    if (this.cameraSession) {
      this._session.configure(this.api, this.cameraSession, this.cameras);
    }
    this._overlay.configure(
      this.presentation === "overlay" ? this._session.camera : undefined,
    );
  }

  protected render() {
    const camera = this._session.camera;
    if (!camera || !this._session.supported) return nothing;
    const active = this._session.active;
    const connecting = this._session.connecting;
    const visible =
      this.presentation === "toolbar" ||
      active ||
      connecting ||
      camera.overlayVisible;
    return staticHtml`<div class="talk-layer">
      <div class="talk-stack">
        <${toastRegionTag}
          class="talk-toast"
          mode="overlay"
          .notices=${this._toasts.notices}
        ></${toastRegionTag}>
        ${
          active
            ? html`<div
                class="talk-controls"
                role="group"
                aria-label=${this.localize("talk.controls")}
              >
                <canvas aria-hidden="true"></canvas>
                ${this._renderTalkButton(
                  "microphone",
                  "round-button talk-button",
                  this._session.microphoneMuted
                    ? this.localize("talk.unmute_microphone")
                    : this.localize("talk.mute_microphone"),
                  renderIcon(
                    this._session.microphoneMuted
                      ? "microphoneOff"
                      : "microphone",
                  ),
                )}
                ${this._renderTalkButton(
                  "stop",
                  this._session.microphoneMuted
                    ? "round-button talk-button center muted"
                    : "round-button talk-button center",
                  this.localize("talk.disconnect"),
                  renderIcon("microphone"),
                )}
                ${this._renderTalkButton(
                  "speaker",
                  "round-button talk-button",
                  camera.muted
                    ? this.localize("camera.unmute")
                    : this.localize("camera.mute"),
                  renderIcon(camera.muted ? "volumeOff" : "volumeOn"),
                )}
              </div>`
            : html`<div
                class=${visible ? "inactive-control visible" : "inactive-control"}
                aria-hidden=${visible ? "false" : "true"}
                ?inert=${!visible}
                @pointerenter=${this._overlay.handlePointerEnter}
                @pointerleave=${this._overlay.handlePointerLeave}
                @focusin=${this._overlay.handleFocusIn}
                @focusout=${this._overlay.handleFocusOut}
              >
                ${this._renderTalkButton(
                  "connect",
                  connecting
                    ? "round-button talk-button inactive connecting"
                    : "round-button talk-button inactive",
                  connecting
                    ? this.localize("talk.cancel_connecting")
                    : this.localize("talk.connect"),
                  renderIcon("microphoneOff"),
                  !camera.available,
                  connecting,
                )}
              </div>`
        }
      </div>
    </div>`;
  }

  protected updated(): void {
    const inactive =
      this.renderRoot.querySelector<HTMLElement>(".inactive-control") ??
      undefined;
    this._visibilityMotion.update(
      inactive,
      inactive?.classList.contains("visible") ?? false,
    );
    const spinner =
      this.renderRoot.querySelector<HTMLElement>(".connecting-spinner") ??
      undefined;
    if (spinner !== this._spinnerElement) {
      this._spinnerMotion.cancel();
      this._spinnerElement = spinner;
      if (spinner && !reducedMotionRequested()) {
        this._spinnerMotion.start(
          spinner,
          { transform: ["rotate(0deg)", "rotate(360deg)"] },
          { duration: 0.7, ease: "linear", repeat: Infinity },
        );
      }
    }
    if (!this._session.active) return;
    this._soundwave.attach(
      this.renderRoot.querySelector<HTMLCanvasElement>("canvas") ?? undefined,
      this._talkStream,
      this._session.camera?.incomingStream,
    );
  }

  public disconnectedCallback(): void {
    this._visibilityMotion.disconnect();
    this._spinnerMotion.cancel();
    this._spinnerElement = undefined;
    this._soundwave.dispose();
    super.disconnectedCallback();
  }

  private _handleConnected(connection: TalkConnection): void {
    this._talkStream = connection.localStream;
    this._toasts.success(this.localize("talk.connected"), {
      durationMs: TALK_SUCCESS_TOAST_DURATION_MS,
      key: TALK_TOAST_KEY,
    });
    this.requestUpdate();
  }

  private _handleFailed(): void {
    this._talkStream = undefined;
    this._soundwave.dispose();
    this._toasts.error(this.localize("talk.failed"), {
      durationMs: TALK_ERROR_TOAST_DURATION_MS,
      key: TALK_TOAST_KEY,
    });
  }

  private _handleStopped(): void {
    this._talkStream = undefined;
    this._soundwave.dispose();
  }

  private readonly _toggleConnection = (): void => {
    if (this._session.connecting) {
      this._session.stop();
      return;
    }
    void this._session.start();
  };
  private _activate(action: TalkControlAction): void {
    if (action === "connect") this._toggleConnection();
    else if (action === "microphone") this._toggleMicrophone();
    else if (action === "speaker") this._toggleSpeaker();
    else this._stop();
  }
  private _renderTalkButton(
    action: TalkControlAction,
    className: string,
    label: string,
    icon: unknown,
    disabled = false,
    busy = false,
  ) {
    return html`<button
      class=${className}
      type="button"
      data-talk-action=${action}
      aria-busy=${busy ? "true" : "false"}
      aria-label=${label}
      ?disabled=${disabled}
      @click=${this._preventClick}
      @pointerdown=${this._press.handlePointerDown}
      @pointerup=${this._press.handlePointerUp}
      @pointercancel=${this._press.handlePointerCancel}
      @lostpointercapture=${this._press.handlePointerCancel}
      @keydown=${this._press.handleKeyDown}
      @keyup=${this._press.handleKeyUp}
    >
      ${icon}${busy ? html`<span class="connecting-spinner"></span>` : nothing}
    </button>`;
  }
  private readonly _preventClick = (event: Event): void =>
    event.preventDefault();
  private readonly _stop = (): void => this._session.stop();
  private readonly _toggleMicrophone = (): void =>
    this._session.toggleMicrophoneMute();
  private readonly _toggleSpeaker = (): void => {
    const camera = this._session.camera;
    if (camera) camera.setMuted(!camera.muted);
  };
  static styles = [roundButtonStyles, twoWayTalkStyles];
}

if (!customElements.get(TALK_TAG)) {
  customElements.define(TALK_TAG, TwoWayTalkComponent);
}

declare global {
  interface HTMLElementTagNameMap {
    [TALK_TAG]: TwoWayTalkComponent;
  }
}
