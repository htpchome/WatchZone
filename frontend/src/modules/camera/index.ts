import { LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import { CAMERA_LIVE_PRESENTATION_TAG, CAMERA_TAG } from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import { ToastManager } from "../../ui/toast-manager";
import { cameraStyles } from "./camera.styles";
import { CameraAudioController } from "./live/audio.controller";
import type {
  CameraLivePresentation,
  CameraToastRequestDetail,
} from "./live/presentation";
import "./live/presentation";
import { CameraLiveSessionController } from "./live/session.controller";

export type CameraShadowStyle = "medium" | "none" | "small";

const presentationTag = unsafeStatic(CAMERA_LIVE_PRESENTATION_TAG);

/** Camera module composition root. Provider, audio, and presentation stay separate. */
export class CameraModule extends LitElement {
  public static properties = {
    api: { attribute: false },
    available: { attribute: false, type: Boolean },
    entityId: { attribute: false },
    lowLatencyHls: { attribute: false, type: Boolean },
    posterUrl: { attribute: false },
    roundedCorners: { attribute: false, type: Boolean },
    shadowStyle: { attribute: false },
    startUnmutedPcTablet: { attribute: false, type: Boolean },
    startUnmutedPhone: { attribute: false, type: Boolean },
  };

  private readonly _toasts = new ToastManager(this);
  private readonly _audio: CameraAudioController = new CameraAudioController(
    this,
    {
      dismissToast: (key) => this._toasts.dismiss(key),
      getMediaState: (): {
        hls?: HTMLVideoElement;
        selected?: "hls" | "webrtc";
        webRtc?: HTMLVideoElement;
      } => ({
        hls: this._session.hlsVideo,
        selected: this._session.selected,
        webRtc: this._presentation?.webRtcVideo,
      }),
      showWarning: (message, key) => this._toasts.warning(message, { key }),
    },
  );
  private readonly _session: CameraLiveSessionController =
    new CameraLiveSessionController(this, {
      getInitialMuted: (): boolean => this._audio.muted,
      onActiveVideoChanged: (video) =>
        this._audio.handleActiveVideoChanged(video),
    });

  public api?: HomeAssistantApi;
  public available = false;
  public entityId?: string;
  public lowLatencyHls = true;
  public posterUrl?: string;
  public roundedCorners = true;
  public shadowStyle: CameraShadowStyle = "medium";
  public startUnmutedPcTablet = false;
  public startUnmutedPhone = false;

  private get _presentation(): CameraLivePresentation | undefined {
    return (
      this.renderRoot.querySelector<CameraLivePresentation>(
        CAMERA_LIVE_PRESENTATION_TAG,
      ) ?? undefined
    );
  }

  protected willUpdate(): void {
    this._audio.configure(
      this.entityId,
      this.startUnmutedPcTablet,
      this.startUnmutedPhone,
      false,
    );
    this._session.configure(
      this.api,
      this.entityId,
      this.available,
      this.lowLatencyHls,
    );
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
        <${presentationTag}
          class="live-presentation"
          .available=${this.available}
          .failed=${this._session.failed}
          .hlsVideo=${this._session.hlsVideo}
          .muted=${this._audio.muted}
          .notices=${this._toasts.notices}
          .posterUrl=${this.posterUrl}
          .selected=${this._session.selected}
          .sessionRevision=${this._session.revision}
          .transport=${this._session.transport}
          .webRtcStream=${this._session.webRtcStream}
          @camera-media-attached=${this._handleMediaAttached}
          @camera-mute-toggle=${this._handleMuteToggle}
          @camera-toast-request=${this._handleToastRequest}
          @camera-webrtc-decoded=${this._handleWebRtcDecoded}
          @camera-webrtc-presented=${this._handleWebRtcPresented}
        ></${presentationTag}>
      </div>
    `;
  }

  protected updated(): void {
    this._audio.syncMediaState();
  }

  private readonly _handleMediaAttached = (): void => {
    this._audio.syncMediaState();
  };

  private readonly _handleMuteToggle = (): void => {
    this._audio.toggleUserMute();
  };

  private readonly _handleToastRequest = (
    event: CustomEvent<CameraToastRequestDetail>,
  ): void => {
    this._toasts.show(event.detail.severity, event.detail.message, {
      key: event.detail.key,
    });
  };

  private readonly _handleWebRtcDecoded = (
    event: CustomEvent<HTMLVideoElement>,
  ): void => {
    this._session.handleWebRtcDecoded(event.detail);
  };

  private readonly _handleWebRtcPresented = (): void => {
    this._session.handleWebRtcPresented();
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
