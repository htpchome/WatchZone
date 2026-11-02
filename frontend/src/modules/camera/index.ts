import { LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import { CAMERA_LIVE_PRESENTATION_TAG, CAMERA_TAG } from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import { cameraStyles } from "./camera.styles";
import { CameraAudioController } from "./live/audio.controller";
import type {
  CameraLivePresentation,
  CameraMediaAttachedDetail,
} from "./live/presentation";
import "./live/presentation";
import { LiveSessionController } from "./live/session.controller";

export type CameraShadowStyle = "medium" | "none" | "small";
const cameraPresentationTag = unsafeStatic(CAMERA_LIVE_PRESENTATION_TAG);

/** Stable composition boundary for all camera capabilities and presentations. */
export class CameraModule extends LitElement {
  public static properties = {
    posterUrl: { attribute: false },
    roundedCorners: { attribute: false, type: Boolean },
    shadowStyle: { attribute: false },
  };

  private _api?: HomeAssistantApi;
  private _autoplayWarning = false;
  private _available = false;
  private _entityId?: string;
  private _startUnmutedPcTablet = false;
  private _startUnmutedPhone = false;
  private readonly _audio: CameraAudioController;
  private readonly _sessions: LiveSessionController;

  public posterUrl?: string;
  public roundedCorners = true;
  public shadowStyle: CameraShadowStyle = "medium";

  public constructor() {
    super();
    this._audio = new CameraAudioController(this, {
      dismissMessage: () => {
        this._autoplayWarning = false;
        this.requestUpdate();
      },
      getMediaState: () => ({
        hls: this._sessions.hlsVideo,
        selected: this._sessions.selected,
        webRtc: this._presentation()?.webRtcVideo,
      }),
      showAutoplayWarning: () => {
        this._autoplayWarning = true;
        this.requestUpdate();
      },
    });
    this._sessions = new LiveSessionController(this, {
      getInitialMuted: () => this._audio.muted,
      onActiveVideoChanged: (video) =>
        this._audio.handleActiveVideoChanged(video),
      onHlsSelected: (video) => this._audio.captureAutoplayFallback(video),
      onPresentedTransportChanged: () => this.requestUpdate(),
    });
  }

  public set api(value: HomeAssistantApi | undefined) {
    if (this._api?.identity === value?.identity) return;
    this._api = value;
    this._configureSession();
  }

  public set available(value: boolean) {
    if (this._available === value) return;
    this._available = value;
    this._configureSession();
  }

  public set entityId(value: string | undefined) {
    if (this._entityId === value) return;
    this._entityId = value;
    this._configureAudio(true);
    this._configureSession();
  }

  public set startUnmutedPcTablet(value: boolean) {
    if (this._startUnmutedPcTablet === value) return;
    this._startUnmutedPcTablet = value;
    this._configureAudio(!this._sessions.selected);
  }

  public set startUnmutedPhone(value: boolean) {
    if (this._startUnmutedPhone === value) return;
    this._startUnmutedPhone = value;
    this._configureAudio(!this._sessions.selected);
  }

  protected render() {
    return staticHtml`
      <div
        class=${[
          "camera",
          this.roundedCorners ? "" : "square-camera-corners",
          this.shadowStyle === "small" ? "camera-shadow-small" : "",
          this.shadowStyle === "none" ? "camera-shadow-none" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <${cameraPresentationTag}
          class="camera-presentation"
          .autoplayWarning=${this._autoplayWarning}
          .available=${this._available}
          .error=${this._sessions.error}
          .hlsVideo=${this._sessions.hlsVideo}
          .muted=${this._audio.muted}
          .posterUrl=${this.posterUrl}
          .selected=${this._sessions.selected}
          .sessionRevision=${this._sessions.revision}
          .transport=${this._sessions.transport}
          .webRtcStream=${this._sessions.webRtcStream}
          @camera-media-attached=${this._handleMediaAttached}
          @camera-mute-toggle=${this._handleMuteToggle}
          @camera-retry=${this._handleRetry}
          @camera-webrtc-decoded=${this._handleWebRtcDecoded}
        ></${cameraPresentationTag}>
      </div>
    `;
  }

  private _configureAudio(resetPreference: boolean): void {
    this._audio.configure(
      this._entityId,
      this._startUnmutedPcTablet,
      this._startUnmutedPhone,
      resetPreference,
    );
  }

  private _configureSession(): void {
    this._sessions.configure(this._api, this._entityId, this._available);
  }

  private _presentation(): CameraLivePresentation | null {
    return (
      this.shadowRoot?.querySelector<CameraLivePresentation>(
        CAMERA_LIVE_PRESENTATION_TAG,
      ) ?? null
    );
  }

  private readonly _handleMediaAttached = (
    event: CustomEvent<CameraMediaAttachedDetail>,
  ): void => {
    event.stopPropagation();
    this._audio.applyTo(event.detail.video);
    void this._audio.requestPlayback(event.detail.video);
    this._audio.syncMediaState();
  };

  private readonly _handleMuteToggle = (event: Event): void => {
    event.stopPropagation();
    this._audio.toggleUserMute();
  };

  private readonly _handleRetry = (event: Event): void => {
    event.stopPropagation();
    this._sessions.retry();
  };

  private readonly _handleWebRtcDecoded = (
    event: CustomEvent<HTMLVideoElement>,
  ): void => {
    event.stopPropagation();
    this._sessions.handleWebRtcDecoded(event.detail);
  };

  static styles = cameraStyles;
}

if (!customElements.get(CAMERA_TAG)) {
  customElements.define(CAMERA_TAG, CameraModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_TAG]: CameraModule;
  }
}
