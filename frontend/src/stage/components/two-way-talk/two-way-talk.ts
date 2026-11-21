import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  TALK_ERROR_TOAST_DURATION_MS,
  TALK_SUCCESS_TOAST_DURATION_MS,
  TALK_TAG,
  TOAST_REGION_TAG,
  TWO_WAY_TALK_CONNECT_EVENT,
  TWO_WAY_TALK_CONTROLS_TAG,
  TWO_WAY_TALK_MICROPHONE_EVENT,
  TWO_WAY_TALK_SPEAKER_EVENT,
  TWO_WAY_TALK_STOP_EVENT,
} from "../../../core/constants";
import type { CameraSessionContext } from "../../camera-session-context";
import type { LiveConnectionType } from "../../../core/config";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import { ToastManager } from "../../../ui/toast/manager";
import "../../../ui/toast/region";
import "../../../ui/two-way-talk/controls";
import { OverlayInteractionController } from "../../overlay-interaction.controller";
import { TalkSessionController } from "./session.controller";
import { twoWayTalkStyles } from "./two-way-talk.styles";
import { VisibilityMotion } from "../../../ui/motion";

const toastRegionTag = unsafeStatic(TOAST_REGION_TAG);
const twoWayTalkControlsTag = unsafeStatic(TWO_WAY_TALK_CONTROLS_TAG);
const TALK_TOAST_KEY = "two-way-talk-status";

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
  private readonly _overlay = new OverlayInteractionController(this);
  private _talkStream?: MediaStream;
  private readonly _visibilityMotion = new VisibilityMotion();
  private readonly _session = new TalkSessionController(this, {
    onConnected: (localStream) => this._handleConnected(localStream),
    onFailed: () => this._handleFailed(),
    onStopped: () => this._handleStopped(),
  });

  public api?: HomeAssistantApi;
  public cameraSession?: CameraSessionContext;
  public cameras: readonly {
    readonly connection: LiveConnectionType;
    readonly entityId: string;
    readonly label?: string;
  }[] = [];
  public localize: LocalizeFunction = englishLocalize;
  public presentation: "overlay" | "standard" = "standard";

  protected willUpdate(): void {
    if (this.cameraSession) {
      this._session.configure(
        this.api,
        this.cameraSession,
        this.cameras.map((camera) => ({
          ...camera,
          label: camera.label ?? camera.entityId,
        })),
        this.localize,
      );
    }
    this._overlay.configure(
      this.presentation === "overlay" ? this._session.camera : undefined,
    );
  }

  protected render() {
    const camera = this._session.camera;
    const active = this._session.active;
    const connecting = this._session.connecting;
    if (
      !camera ||
      (!this._session.supported &&
        !this._session.supportPending &&
        !active &&
        !connecting)
    )
      return nothing;
    const visible =
      this.presentation !== "overlay" ||
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
            ? this._renderControls("connected")
            : html`<div
                class=${visible ? "inactive-control visible" : "inactive-control"}
                aria-hidden=${visible ? "false" : "true"}
                ?inert=${!visible}
                @pointerenter=${this._overlay.handlePointerEnter}
                @pointerleave=${this._overlay.handlePointerLeave}
                @focusin=${this._overlay.handleFocusIn}
                @focusout=${this._overlay.handleFocusOut}
              >
                ${this._renderControls(connecting ? "connecting" : "ready")}
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
  }

  public disconnectedCallback(): void {
    this._visibilityMotion.disconnect();
    super.disconnectedCallback();
  }

  private _handleConnected(localStream: MediaStream): void {
    this._talkStream = localStream;
    this._toasts.success(this.localize("talk.connected"), {
      durationMs: TALK_SUCCESS_TOAST_DURATION_MS,
      key: TALK_TOAST_KEY,
    });
    this.requestUpdate();
  }

  private _handleFailed(): void {
    this._talkStream = undefined;
    this._toasts.error(this.localize("talk.failed"), {
      durationMs: TALK_ERROR_TOAST_DURATION_MS,
      key: TALK_TOAST_KEY,
    });
  }

  private _handleStopped(): void {
    this._talkStream = undefined;
  }

  private readonly _toggleConnection = (): void => {
    if (this._session.connecting) {
      this._session.stop();
      return;
    }
    void this._session.start();
  };
  private _renderControls(status: "connected" | "connecting" | "ready") {
    return staticHtml`<${twoWayTalkControlsTag}
      .connectLabel=${this.localize("talk.connect")}
      .disabled=${!this._session.camera?.available || !this._session.supported}
      .incomingStream=${this._session.camera?.incomingStream}
      .localize=${this.localize}
      .microphoneMuted=${this._session.microphoneMuted}
      .outgoingStream=${this._talkStream}
      .presentation=${this.presentation}
      .speakerMuted=${this._session.speakerMuted}
      .status=${status}
      .stopLabel=${this.localize("talk.disconnect")}
      @${unsafeStatic(TWO_WAY_TALK_CONNECT_EVENT)}=${this._toggleConnection}
      @${unsafeStatic(TWO_WAY_TALK_STOP_EVENT)}=${this._stop}
      @${unsafeStatic(TWO_WAY_TALK_MICROPHONE_EVENT)}=${this._toggleMicrophone}
      @${unsafeStatic(TWO_WAY_TALK_SPEAKER_EVENT)}=${this._toggleSpeaker}
    ></${twoWayTalkControlsTag}>`;
  }
  private readonly _stop = (): void => this._session.stop();
  private readonly _toggleMicrophone = (): void =>
    this._session.toggleMicrophoneMute();
  private readonly _toggleSpeaker = (): void =>
    this._session.toggleSpeakerMute();
  static styles = [twoWayTalkStyles];
}

if (!customElements.get(TALK_TAG)) {
  customElements.define(TALK_TAG, TwoWayTalkComponent);
}

declare global {
  interface HTMLElementTagNameMap {
    [TALK_TAG]: TwoWayTalkComponent;
  }
}
