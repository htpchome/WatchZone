import { html, LitElement, nothing } from "lit";

import { PERSISTENT_TALK_TAG } from "../../core/constants";
import { englishLocalize } from "../../core/localization";
import { themeTokens } from "../../styles/theme-tokens";
import { renderIcon } from "../../ui/icons";
import { roundButtonStyles } from "../../ui/overlay-control.styles";
import { TalkSoundwaveController } from "../../ui/talk-soundwave.controller";
import { OwnedMotion, reducedMotionRequested } from "../../ui/motion";
import { getPersistentTalkSession, type PersistentTalkSnapshot } from "./index";
import { persistentTalkStyles } from "./persistent-talk.styles";

/** Document-level TWT surface shown only away from the matching camera. */
export class PersistentTalkTile extends LitElement {
  private readonly _manager = getPersistentTalkSession();
  private _snapshot: PersistentTalkSnapshot = this._manager.snapshot;
  private readonly _soundwave = new TalkSoundwaveController();
  private readonly _spinner = new OwnedMotion();
  private _spinnerElement?: HTMLElement;
  private _unsubscribe?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribe ??= this._manager.subscribe((snapshot) => {
      this._snapshot = snapshot;
      this.requestUpdate();
    });
  }

  public disconnectedCallback(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._soundwave.dispose();
    this._spinner.cancel();
    this._spinnerElement = undefined;
    super.disconnectedCallback();
  }

  protected render() {
    const { status, surfaceActive, target } = this._snapshot;
    if (!target || surfaceActive) return nothing;
    const t = target.localize ?? englishLocalize;
    const connected = status === "connected";
    const connecting = status === "connecting";
    return html`<aside
      class="persistent-talk"
      role="region"
      aria-label=${t("talk.persistent_controls")}
    >
      <button
        class="round-button dismiss"
        type="button"
        title=${t("talk.dismiss_persistent")}
        aria-label=${t("talk.dismiss_persistent")}
        @click=${this._dismiss}
      >
        ${renderIcon("close")}
      </button>
      <div class="identity">
        <div class="title">${t("talk.persistent_title")}</div>
        <div class="camera-name">${target.label}</div>
      </div>
      <div class="controls" role="group" aria-label=${t("talk.controls")}>
        ${connected ? html`<canvas aria-hidden="true"></canvas>` : nothing}
        <button
          class="round-button"
          type="button"
          title=${
            this._snapshot.microphoneMuted
              ? t("talk.unmute_microphone")
              : t("talk.mute_microphone")
          }
          aria-label=${
            this._snapshot.microphoneMuted
              ? t("talk.unmute_microphone")
              : t("talk.mute_microphone")
          }
          ?disabled=${!connected}
          @click=${this._toggleMicrophone}
        >
          ${renderIcon(
            this._snapshot.microphoneMuted ? "microphoneOff" : "microphone",
          )}
        </button>
        <button
          class=${[
            "round-button",
            "center",
            this._snapshot.microphoneMuted ? "muted" : "",
            connected ? "" : "ready",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          title=${
            connected
              ? t("talk.disconnect_keep_persistent")
              : connecting
                ? t("talk.cancel_connecting")
                : t("talk.restart")
          }
          aria-label=${
            connected
              ? t("talk.disconnect_keep_persistent")
              : connecting
                ? t("talk.cancel_connecting")
                : t("talk.restart")
          }
          aria-busy=${connecting ? "true" : "false"}
          @click=${this._toggleConnection}
        >
          ${renderIcon(connected || connecting ? "microphone" : "microphoneOff")}
          ${connecting ? html`<span class="connecting-spinner"></span>` : nothing}
        </button>
        <button
          class="round-button"
          type="button"
          title=${this._snapshot.muted ? t("camera.unmute") : t("camera.mute")}
          aria-label=${
            this._snapshot.muted ? t("camera.unmute") : t("camera.mute")
          }
          @click=${this._toggleSpeaker}
        >
          ${renderIcon(this._snapshot.muted ? "volumeOff" : "volumeOn")}
        </button>
      </div>
      <button
        class="round-button navigate"
        type="button"
        title=${t("talk.return_to_camera")}
        aria-label=${t("talk.return_to_camera")}
        @click=${this._returnToCamera}
      >
        ${renderIcon("camera")}
      </button>
    </aside>`;
  }

  protected updated(): void {
    const spinner =
      this.renderRoot.querySelector<HTMLElement>(".connecting-spinner") ??
      undefined;
    if (spinner !== this._spinnerElement) {
      this._spinner.cancel();
      this._spinnerElement = spinner;
      if (spinner && !reducedMotionRequested()) {
        this._spinner.start(
          spinner,
          { transform: ["rotate(0deg)", "rotate(360deg)"] },
          { duration: 0.7, ease: "linear", repeat: Infinity },
        );
      }
    }
    const { connection, incomingStream, status } = this._snapshot;
    if (status !== "connected") {
      this._soundwave.dispose();
      return;
    }
    this._soundwave.attach(
      this.renderRoot.querySelector<HTMLCanvasElement>("canvas") ?? undefined,
      connection?.localStream,
      incomingStream,
    );
  }

  private readonly _dismiss = (): void => this._manager.dismiss();
  private readonly _returnToCamera = (): void => this._manager.returnToCamera();
  private readonly _toggleConnection = (): void => {
    if (this._snapshot.status === "connected") {
      this._manager.stopAndRetain();
    } else if (this._snapshot.status === "connecting") {
      this._manager.stopAndRetain();
    } else {
      void this._manager.start();
    }
  };
  private readonly _toggleMicrophone = (): void =>
    this._manager.toggleMicrophoneMute();
  private readonly _toggleSpeaker = (): void => this._manager.toggleSpeaker();

  static styles = [themeTokens, roundButtonStyles, persistentTalkStyles];
}

if (!customElements.get(PERSISTENT_TALK_TAG)) {
  customElements.define(PERSISTENT_TALK_TAG, PersistentTalkTile);
}

declare global {
  interface HTMLElementTagNameMap {
    [PERSISTENT_TALK_TAG]: PersistentTalkTile;
  }
}
