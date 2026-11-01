import { html, LitElement, nothing } from "lit";

import type { HomeAssistantApi } from "../../core/home-assistant";
import { CAMERA_LIVE_VIEW_TAG } from "../../core/constants";
import {
  getMediaSessionManager,
  type MediaSessionLease,
  type MediaSessionSnapshot,
  type MediaTransport,
} from "../../core/media-session-manager";
import type { CameraControlEventDetail } from "./controls-overlay";
import "./controls-overlay";
import { CameraControlsVisibilityController } from "./controls-visibility.controller";
import { cameraLiveViewStyles } from "./live-view.styles";
import {
  isPictureInPictureActive,
  pictureInPictureMethod,
  suppressNativePictureInPicture,
  togglePictureInPicture,
} from "./picture-in-picture";

interface FullscreenDocument extends Document {
  webkitExitFullscreen?(): Promise<void> | void;
  webkitFullscreenElement?: Element | null;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?(): Promise<void> | void;
}

interface FullscreenVideo extends HTMLVideoElement {
  readonly webkitDisplayingFullscreen?: boolean;
  webkitEnterFullScreen?(): void;
  webkitEnterFullscreen?(): void;
}

export class WatchZoneCameraLiveView extends LitElement {
  private _api?: HomeAssistantApi;
  private _available = false;
  private _activeVideo?: HTMLVideoElement;
  private _controlError?: string;
  private _entityId?: string;
  private _fullscreenActive = false;
  private _hlsLease?: MediaSessionLease;
  private _hlsSnapshot: MediaSessionSnapshot = { state: "new" };
  private _hlsUnsubscribe?: () => void;
  private _initialTransport?: MediaTransport;
  private _muted = true;
  private _pictureInPictureActive = false;
  private _posterFailed = false;
  private _posterUrl?: string;
  private _selected?: "hls" | "webrtc";
  private _webRtcDecoded = false;
  private _webRtcLease?: MediaSessionLease;
  private _webRtcSnapshot: MediaSessionSnapshot = { state: "new" };
  private _webRtcUnsubscribe?: () => void;
  private readonly _controlsVisibility = new CameraControlsVisibilityController(
    this,
  );

  public set api(value: HomeAssistantApi | undefined) {
    if (this._api?.identity === value?.identity) {
      return;
    }
    this._initialTransport = undefined;
    this._releaseLeases();
    this._api = value;
    this._syncLeases();
  }

  public set available(value: boolean) {
    if (this._available === value) {
      return;
    }
    this._available = value;
    this._syncLeases();
    this.requestUpdate();
  }

  public set entityId(value: string | undefined) {
    if (this._entityId === value) {
      return;
    }
    this._initialTransport = undefined;
    this._controlError = undefined;
    this._releaseLeases();
    this._entityId = value;
    this._muted = value ? getMediaSessionManager().getCameraMuted(value) : true;
    this._syncLeases();
    this.requestUpdate();
  }

  public set posterUrl(value: string | undefined) {
    if (this._posterUrl === value) {
      return;
    }
    this._posterUrl = value;
    this._posterFailed = false;
    this.requestUpdate();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("fullscreenchange", this._syncControlState);
    document.addEventListener("webkitfullscreenchange", this._syncControlState);
    this._syncLeases();
  }

  public disconnectedCallback(): void {
    document.removeEventListener("fullscreenchange", this._syncControlState);
    document.removeEventListener(
      "webkitfullscreenchange",
      this._syncControlState,
    );
    this._setActiveVideo(undefined);
    this._releaseLeases();
    super.disconnectedCallback();
  }

  protected render() {
    const sourceLabel =
      this._initialTransport === "webrtc"
        ? "WebRTC"
        : this._initialTransport === "hls_native"
          ? "HLS · native"
          : this._initialTransport === "hls_mse"
            ? "HLS · HLS.js"
            : "HLS";
    const error = !this._available
      ? "Camera entity is unavailable"
      : this._webRtcSnapshot.state === "failed" &&
          this._hlsSnapshot.state === "failed"
        ? (this._webRtcSnapshot.error ?? this._hlsSnapshot.error)
        : undefined;
    const showConnectionIndicator = Boolean(
      this._initialTransport || (this._available && !error),
    );
    return html`
      <div
        class="viewport"
        tabindex="0"
        aria-label="Camera live view"
        @pointerenter=${this._controlsVisibility.handlePointerEnter}
        @pointerleave=${this._controlsVisibility.handlePointerLeave}
        @pointerdown=${this._controlsVisibility.handlePointerDown}
        @focusin=${this._controlsVisibility.handleFocusIn}
        @focusout=${this._controlsVisibility.handleFocusOut}
      >
        <div class="generic-fallback" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <path
              d="M11 20.5h30a5 5 0 0 1 5 5v18a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5v-18a5 5 0 0 1 5-5Z"
            />
            <path d="m46 29 10-6v23l-10-6" />
            <circle cx="26" cy="34.5" r="8" />
          </svg>
        </div>
        ${
          this._posterUrl && !this._posterFailed
            ? html`<img
                class="fallback-image poster"
                src=${this._posterUrl}
                alt=""
                aria-hidden="true"
                decoding="async"
                fetchpriority="high"
                @error=${this._handlePosterError}
              />`
            : nothing
        }
        <div class="hls-host" ?hidden=${this._selected !== "hls"}></div>
        <video
          class="webrtc"
          autoplay
          playsinline
          muted
          aria-label="Live camera"
          ?hidden=${this._selected !== "webrtc"}
          @loadeddata=${this._handleWebRtcLoadedData}
        ></video>
        ${
          showConnectionIndicator
            ? html`<div
                class="source-indicator"
                role="status"
                aria-live="polite"
                aria-label=${
                  this._initialTransport
                    ? `Live source: ${sourceLabel}`
                    : "Connecting to camera"
                }
              >
                ${
                  this._initialTransport
                    ? sourceLabel
                    : html`<span
                          class="connection-spinner"
                          aria-hidden="true"
                        ></span>
                        <span>Connecting…</span>`
                }
              </div>`
            : nothing
        }
        ${
          this._selected
            ? html`<watchzone-camera-controls
                .visible=${this._controlsVisibility.visible}
                .errorMessage=${this._controlError}
                .fullscreenActive=${this._fullscreenActive}
                .fullscreenSupported=${this._fullscreenSupported()}
                .muted=${this._muted}
                .pictureInPictureActive=${this._pictureInPictureActive}
                .pictureInPictureSupported=${Boolean(
                  pictureInPictureMethod(this._activeVideo),
                )}
                @camera-control=${this._handleCameraControl}
              ></watchzone-camera-controls>`
            : nothing
        }
        ${
          error
            ? html`<div class="status error" role="alert">
                <div class="status-content">
                  <span>${error}</span>
                  ${
                    this._available
                      ? html`<button type="button" @click=${this._retry}>
                          Retry
                        </button>`
                      : nothing
                  }
                </div>
              </div>`
            : nothing
        }
      </div>
    `;
  }

  protected updated(): void {
    const video =
      this.shadowRoot?.querySelector<HTMLVideoElement>("video.webrtc");
    const stream = this._webRtcSnapshot.stream;
    if (video && video.srcObject !== (stream ?? null)) {
      this._webRtcDecoded = false;
      video.srcObject = stream ?? null;
      video.muted = this._selected !== "webrtc" || this._muted;
      if (stream) {
        void video.play().catch(() => undefined);
      }
    }
    const hlsHost = this.renderRoot.querySelector(".hls-host");
    const hlsVideo = this._hlsSnapshot.video;
    if (hlsHost && hlsVideo && hlsVideo.parentElement !== hlsHost) {
      hlsVideo.setAttribute("aria-label", "Live camera");
      hlsHost.append(hlsVideo);
      void hlsVideo.play().catch(() => undefined);
    }
    if (hlsVideo) {
      hlsVideo.muted = this._selected !== "hls" || this._muted;
    }
  }

  private _syncLeases(): void {
    if (
      !this.isConnected ||
      !this._api ||
      !this._entityId ||
      !this._available
    ) {
      this._releaseLeases();
      return;
    }
    const manager = getMediaSessionManager();
    const webRtcKey = `home_assistant:${this._entityId}`;
    if (this._webRtcLease?.key !== webRtcKey) {
      this._releaseWebRtcLease();
      this._webRtcLease = manager.acquireHomeAssistant(
        this._api,
        this._entityId,
      );
      this._webRtcUnsubscribe = this._webRtcLease.subscribe((snapshot) => {
        this._webRtcSnapshot = snapshot;
        if (snapshot.state === "failed" && this._selected === "webrtc") {
          this._selected = undefined;
          this._setActiveVideo(undefined);
          this._syncHlsLease();
        }
        this.requestUpdate();
      });
    }
    this._syncHlsLease();
  }

  private _syncHlsLease(): void {
    if (
      this._selected === "webrtc" ||
      !this._api ||
      !this._entityId ||
      !this._available ||
      !this.isConnected
    ) {
      return;
    }
    const key = `home_assistant_hls:${this._entityId}`;
    if (this._hlsLease?.key === key) {
      return;
    }
    this._releaseHlsLease();
    this._hlsLease = getMediaSessionManager().acquireHomeAssistantHls(
      this._api,
      this._entityId,
    );
    this._hlsUnsubscribe = this._hlsLease.subscribe((snapshot) => {
      this._hlsSnapshot = snapshot;
      if (snapshot.state === "live" && !this._selected) {
        this._selected = "hls";
        this._initialTransport ??= snapshot.transport;
        this._setActiveVideo(snapshot.video);
        snapshot.timing?.mark("presentation_selected");
      } else if (snapshot.state === "failed" && this._selected === "hls") {
        this._selected = undefined;
        this._setActiveVideo(undefined);
      }
      this.requestUpdate();
    });
  }

  private _releaseLeases(): void {
    this._selected = undefined;
    this._setActiveVideo(undefined);
    this._webRtcDecoded = false;
    this._releaseWebRtcLease();
    this._releaseHlsLease();
  }

  private _releaseWebRtcLease(): void {
    this._webRtcUnsubscribe?.();
    this._webRtcUnsubscribe = undefined;
    this._webRtcLease?.release();
    this._webRtcLease = undefined;
    this._webRtcSnapshot = { state: "new" };
    const video =
      this.shadowRoot?.querySelector<HTMLVideoElement>("video.webrtc");
    if (video) {
      video.srcObject = null;
    }
  }

  private _releaseHlsLease(discard = false): void {
    this._hlsSnapshot.video?.remove();
    this._hlsUnsubscribe?.();
    this._hlsUnsubscribe = undefined;
    if (discard) {
      this._hlsLease?.discard();
    } else {
      this._hlsLease?.release();
    }
    this._hlsLease = undefined;
    this._hlsSnapshot = { state: "new" };
  }

  private readonly _retry = (): void => {
    this._posterFailed = false;
    this._webRtcLease?.retry();
    this._hlsLease?.retry();
    this.requestUpdate();
  };

  private readonly _handlePosterError = (): void => {
    this._posterFailed = true;
    this.requestUpdate();
  };

  private readonly _handleWebRtcLoadedData = (event: Event): void => {
    if (this._webRtcDecoded || !this._webRtcSnapshot.stream) {
      return;
    }
    this._webRtcDecoded = true;
    this._webRtcSnapshot.timing?.mark("first_frame_decoded");
    this._webRtcSnapshot.timing?.mark("presentation_selected");
    this._initialTransport ??= "webrtc";
    this._selected = "webrtc";
    this._setActiveVideo(event.currentTarget as HTMLVideoElement);
    this._releaseHlsLease(true);
    this.requestUpdate();
  };

  private _setActiveVideo(video: HTMLVideoElement | undefined): void {
    if (this._activeVideo === video) {
      return;
    }
    for (const eventName of [
      "enterpictureinpicture",
      "leavepictureinpicture",
      "webkitpresentationmodechanged",
      "webkitbeginfullscreen",
      "webkitendfullscreen",
    ]) {
      this._activeVideo?.removeEventListener(eventName, this._syncControlState);
      video?.addEventListener(eventName, this._syncControlState);
    }
    this._activeVideo = video;
    suppressNativePictureInPicture(video);
    this._syncControlState();
  }

  private readonly _syncControlState = (): void => {
    const documentObject = document as FullscreenDocument;
    const pictureInPictureActive = isPictureInPictureActive(this._activeVideo);
    const fullscreenActive = Boolean(
      document.fullscreenElement ||
      documentObject.webkitFullscreenElement ||
      (this._activeVideo as FullscreenVideo | undefined)
        ?.webkitDisplayingFullscreen,
    );
    if (
      this._pictureInPictureActive === pictureInPictureActive &&
      this._fullscreenActive === fullscreenActive
    ) {
      return;
    }
    this._pictureInPictureActive = pictureInPictureActive;
    this._fullscreenActive = fullscreenActive;
    this.requestUpdate();
  };

  private _fullscreenSupported(): boolean {
    const target = this.renderRoot.querySelector(
      ".viewport",
    ) as FullscreenElement | null;
    const video = this._activeVideo as FullscreenVideo | undefined;
    return Boolean(
      target?.requestFullscreen ||
      target?.webkitRequestFullscreen ||
      video?.webkitEnterFullscreen ||
      video?.webkitEnterFullScreen,
    );
  }

  private readonly _handleCameraControl = (
    event: CustomEvent<CameraControlEventDetail>,
  ): void => {
    this._controlError = undefined;
    if (event.detail.action === "mute") {
      this._muted = !this._muted;
      if (this._entityId) {
        getMediaSessionManager().setCameraMuted(this._entityId, this._muted);
      }
      if (this._activeVideo) {
        const video = this._activeVideo;
        video.muted = this._muted;
        if (!this._muted) {
          void video.play().catch(() => {
            this._muted = true;
            if (this._activeVideo === video) {
              video.muted = true;
            }
            this._controlError =
              "The browser blocked unmuted playback. Tap mute again to retry.";
            this.requestUpdate();
          });
        }
      }
      this.requestUpdate();
      return;
    }
    if (event.detail.action === "picture_in_picture") {
      void this._togglePictureInPicture();
      return;
    }
    if (event.detail.action === "fullscreen") {
      void this._toggleFullscreen();
    }
  };

  private async _togglePictureInPicture(): Promise<void> {
    if (!this._activeVideo) {
      return;
    }
    try {
      await togglePictureInPicture(this._activeVideo);
      this._syncControlState();
    } catch (error) {
      this._controlError =
        error instanceof Error
          ? error.message
          : "Unable to change Picture-in-Picture mode.";
      this.requestUpdate();
    }
  }

  private async _toggleFullscreen(): Promise<void> {
    const documentObject = document as FullscreenDocument;
    const target = this.renderRoot.querySelector(
      ".viewport",
    ) as FullscreenElement | null;
    try {
      if (
        document.fullscreenElement ||
        documentObject.webkitFullscreenElement
      ) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else {
          await documentObject.webkitExitFullscreen?.();
        }
      } else if (target?.requestFullscreen) {
        await target.requestFullscreen();
      } else if (target?.webkitRequestFullscreen) {
        await target.webkitRequestFullscreen();
      } else {
        const video = this._activeVideo as FullscreenVideo | undefined;
        const enter =
          video?.webkitEnterFullscreen ?? video?.webkitEnterFullScreen;
        if (!video || !enter) {
          throw new Error("Fullscreen is not supported on this device.");
        }
        enter.call(video);
      }
      this._syncControlState();
    } catch (error) {
      this._controlError =
        error instanceof Error
          ? error.message
          : "Unable to change fullscreen mode.";
      this.requestUpdate();
    }
  }

  static styles = cameraLiveViewStyles;
}

if (!customElements.get(CAMERA_LIVE_VIEW_TAG)) {
  customElements.define(CAMERA_LIVE_VIEW_TAG, WatchZoneCameraLiveView);
}

declare global {
  interface HTMLElementTagNameMap {
    "watchzone-camera-live-view": WatchZoneCameraLiveView;
  }
}
