import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  TALK_ERROR_TOAST_DURATION_MS,
  TALK_SUCCESS_TOAST_DURATION_MS,
  TALK_TAG,
  TOAST_REGION_TAG,
} from "../../core/constants";
import type { CameraSessionContext } from "../../core/camera-session-context";
import type { HomeAssistantApi } from "../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { roundButtonStyles } from "../../styles/theme-tokens";
import { renderIcon } from "../../ui/icons";
import { ToastManager } from "../../ui/toast-manager";
import "../../ui/toast-region";
import type { TalkConnection } from "../../providers/talk-source-resolver";
import { TalkSessionController } from "./session.controller";
import { TalkSoundwaveController } from "./soundwave.controller";
import { twoWayTalkStyles } from "./two-way-talk.styles";

const toastRegionTag = unsafeStatic(TOAST_REGION_TAG);
const TALK_TOAST_KEY = "two-way-talk-status";

/** User-placeable two-way-talk presentation over the active camera. */
export class TwoWayTalkComponent extends LitElement {
  public static properties = {
    api: { attribute: false },
    cameraSession: { attribute: false },
    enabledCameraIds: { attribute: false },
    localize: { attribute: false },
  };

  private readonly _toasts = new ToastManager(this);
  private readonly _soundwave = new TalkSoundwaveController();
  private _hoverCameraEntityId?: string;
  private _releaseHoverOverlay?: () => void;
  private _talkStream?: MediaStream;
  private readonly _session = new TalkSessionController(this, {
    onConnected: (connection) => this._handleConnected(connection),
    onFailed: () => this._handleFailed(),
    onStopped: () => this._handleStopped(),
  });

  public api?: HomeAssistantApi;
  public cameraSession?: CameraSessionContext;
  public enabledCameraIds: readonly string[] = [];
  public localize: LocalizeFunction = englishLocalize;

  protected willUpdate(): void {
    if (this.cameraSession) {
      this._session.configure(
        this.api,
        this.cameraSession,
        this.enabledCameraIds,
      );
    }
    if (
      this._hoverCameraEntityId &&
      this._hoverCameraEntityId !== this._session.camera?.entityId
    ) {
      this._releaseHoverHold();
    }
  }

  protected render() {
    const camera = this._session.camera;
    if (!camera || !this._session.supported) return nothing;
    const active = this._session.active;
    const connecting = this._session.connecting;
    const visible = active || connecting || camera.overlayVisible;
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
                <button
                  class="round-button talk-button"
                  type="button"
                  aria-label=${
                    this._session.microphoneMuted
                      ? this.localize("talk.unmute_microphone")
                      : this.localize("talk.mute_microphone")
                  }
                  @click=${this._toggleMicrophone}
                >
                  ${renderIcon(
                    this._session.microphoneMuted
                      ? "microphoneOff"
                      : "microphone",
                  )}
                </button>
                <button
                  class="round-button talk-button center"
                  type="button"
                  aria-label=${this.localize("talk.disconnect")}
                  @click=${this._stop}
                >
                  ${renderIcon("microphone")}
                </button>
                <button
                  class="round-button talk-button"
                  type="button"
                  aria-label=${
                    camera.muted
                      ? this.localize("camera.unmute")
                      : this.localize("camera.mute")
                  }
                  @click=${this._toggleSpeaker}
                >
                  ${renderIcon(camera.muted ? "volumeOff" : "volumeOn")}
                </button>
              </div>`
            : html`<div
                class=${visible ? "inactive-control visible" : "inactive-control"}
                @pointerenter=${this._acquireHoverHold}
                @pointerleave=${this._releaseHoverHold}
              >
                <button
                  class=${
                    connecting
                      ? "round-button talk-button inactive connecting"
                      : "round-button talk-button inactive"
                  }
                  type="button"
                  aria-busy=${connecting ? "true" : "false"}
                  aria-label=${
                    connecting
                      ? this.localize("talk.cancel_connecting")
                      : this.localize("talk.connect")
                  }
                  ?disabled=${!camera.available}
                  @click=${this._toggleConnection}
                >
                  ${renderIcon("microphoneOff")}
                </button>
              </div>`
        }
      </div>
    </div>`;
  }

  protected updated(): void {
    if (!this._session.active) return;
    this._soundwave.attach(
      this.renderRoot.querySelector<HTMLCanvasElement>("canvas") ?? undefined,
      this._talkStream,
      this._session.camera?.incomingStream,
    );
  }

  public disconnectedCallback(): void {
    this._releaseHoverHold();
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
  private readonly _stop = (): void => this._session.stop();
  private readonly _toggleMicrophone = (): void =>
    this._session.toggleMicrophoneMute();
  private readonly _toggleSpeaker = (): void => {
    const camera = this._session.camera;
    if (camera) camera.setMuted(!camera.muted);
  };
  private readonly _acquireHoverHold = (): void => {
    const camera = this._session.camera;
    if (!this._releaseHoverOverlay) {
      this._releaseHoverOverlay = camera?.holdOverlay();
      this._hoverCameraEntityId = camera?.entityId;
    }
    camera?.revealOverlay();
  };
  private readonly _releaseHoverHold = (): void => {
    this._releaseHoverOverlay?.();
    this._releaseHoverOverlay = undefined;
    this._hoverCameraEntityId = undefined;
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
