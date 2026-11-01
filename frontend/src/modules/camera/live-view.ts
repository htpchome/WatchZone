import { html, LitElement, nothing } from "lit";

import { HomeAssistantLiveConnectionResolver } from "../../connections/home-assistant/resolver";
import { createHomeAssistantMediaPresentation } from "../../connections/home-assistant/presentation";
import { getClientEnvironment } from "../../core/client-environment";
import type { HomeAssistantApi } from "../../core/home-assistant";
import { CAMERA_LIVE_VIEW_TAG } from "../../core/constants";
import {
  playMediaElement,
  setMediaElementDefaultMuted,
  setMediaElementRuntimeMuted,
} from "../../core/media-playback";
import {
  getMediaSessionManager,
  type MediaSessionLease,
  type MediaSessionSnapshot,
  type MediaTransport,
} from "../../core/media-session-manager";
import { TimedVisibilityController } from "../../ui/timed-visibility.controller";
import type { ToastElement } from "../../ui/toast";
import "../../ui/toast";
import type { CameraControlEventDetail } from "./controls-overlay";
import "./controls-overlay";
import { CAMERA_OVERLAY_HIDE_DELAY_MS } from "./constants";
import { CameraControlsVisibilityController } from "./controls-visibility.controller";
import { FullscreenLifecycleController } from "./fullscreen-lifecycle.controller";
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

function documentIsHidden(): boolean {
  return document.hidden === true || document.visibilityState === "hidden";
}

function isAutoplayDenied(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotAllowedError"
  );
}

export class CameraLiveView extends LitElement {
  private _api?: HomeAssistantApi;
  private _autoplayBlocked = false;
  private _available = false;
  private _activeVideo?: HTMLVideoElement;
  private _desiredMuted = true;
  private _entityId?: string;
  private _explicitMutePreference = false;
  private _fullscreenActive = false;
  private _hlsLease?: MediaSessionLease;
  private _hlsSnapshot: MediaSessionSnapshot = { state: "new" };
  private _hlsUnsubscribe?: () => void;
  private _presentedTransport?: MediaTransport;
  private _muted = true;
  private _pictureInPictureActive = false;
  private _posterFailed = false;
  private _posterUrl?: string;
  private _selected?: "hls" | "webrtc";
  private _startUnmutedPcTablet = false;
  private _startUnmutedPhone = false;
  private _webRtcDecoded = false;
  private _webRtcLease?: MediaSessionLease;
  private _webRtcSnapshot: MediaSessionSnapshot = { state: "new" };
  private _webRtcUnsubscribe?: () => void;
  private readonly _controlsVisibility = new CameraControlsVisibilityController(
    this,
  );
  private readonly _sourceIntroduction = new TimedVisibilityController(
    this,
    CAMERA_OVERLAY_HIDE_DELAY_MS,
  );
  private readonly _fullscreenLifecycle = new FullscreenLifecycleController(
    this,
    {
      getCurrentVideo: () => this._activeVideo,
      onExit: () => this._syncControlState(),
      resumePlayback: (video) => this._requestPlayback(video),
    },
  );
  private readonly _clientEnvironment = getClientEnvironment();
  private readonly _connectionResolver =
    new HomeAssistantLiveConnectionResolver(
      this._clientEnvironment,
      getMediaSessionManager(),
    );
  private readonly _mediaPresentation = createHomeAssistantMediaPresentation(
    this._clientEnvironment.host,
  );

  public set api(value: HomeAssistantApi | undefined) {
    if (this._api?.identity === value?.identity) {
      return;
    }
    this._resetPresentedTransport();
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
    this._resetPresentedTransport();
    this._dismissToast();
    this._releaseLeases();
    this._entityId = value;
    this._syncMutePreference();
    this._syncLeases();
    this.requestUpdate();
  }

  public set startUnmutedPcTablet(value: boolean) {
    if (this._startUnmutedPcTablet === value) return;
    this._startUnmutedPcTablet = value;
    if (!this._activeVideo && !this._selected) this._syncMutePreference();
  }

  public set startUnmutedPhone(value: boolean) {
    if (this._startUnmutedPhone === value) return;
    this._startUnmutedPhone = value;
    if (!this._activeVideo && !this._selected) this._syncMutePreference();
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
    document.addEventListener("fullscreenchange", this._handleFullscreenChange);
    document.addEventListener(
      "webkitfullscreenchange",
      this._handleFullscreenChange,
    );
    document.addEventListener("visibilitychange", this._handleVisibilityChange);
    this._syncMutePreference();
    void this.updateComplete.then(() => {
      if (this.isConnected) this._syncLeases();
    });
  }

  public disconnectedCallback(): void {
    document.removeEventListener(
      "fullscreenchange",
      this._handleFullscreenChange,
    );
    document.removeEventListener(
      "webkitfullscreenchange",
      this._handleFullscreenChange,
    );
    document.removeEventListener(
      "visibilitychange",
      this._handleVisibilityChange,
    );
    this._setActiveVideo(undefined);
    this._clearSourceIntroduction();
    this._releaseLeases();
    super.disconnectedCallback();
  }

  protected render() {
    const sourceLabel =
      this._presentedTransport === "webrtc"
        ? "WebRTC"
        : this._presentedTransport === "hls_native"
          ? "HLS · native"
          : this._presentedTransport === "hls_mse"
            ? "HLS · HLS.js"
            : "HLS";
    const error = !this._available
      ? "Camera entity is unavailable"
      : this._webRtcSnapshot.state === "failed" &&
          this._hlsSnapshot.state === "failed"
        ? (this._webRtcSnapshot.error ?? this._hlsSnapshot.error)
        : undefined;
    const connecting = this._available && !error && !this._selected;
    const showSource = Boolean(
      this._selected &&
      this._presentedTransport &&
      (this._sourceIntroduction.visible || this._controlsVisibility.visible),
    );
    const showConnectionIndicator = connecting || showSource;
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
        ${
          !this._selected
            ? html`<div class="generic-fallback" aria-hidden="true">
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
                }`
            : nothing
        }
        ${this._mediaPresentation.render({
          muted: this._muted,
          onWebRtcLoadedData: this._handleWebRtcLoadedData,
          selected: this._selected,
        })}
        ${
          showConnectionIndicator
            ? html`<div
                class="source-indicator ${
                  this._controlsVisibility.visible ? "controls-visible" : ""
                }"
                role="status"
                aria-live="polite"
                aria-label=${
                  showSource
                    ? `Live source: ${sourceLabel}`
                    : "Connecting to camera"
                }
              >
                ${
                  showSource
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
        <watchzone-toast></watchzone-toast>
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
      this._applyMuteToElement(video, this._muted);
      video.srcObject = stream ?? null;
      if (stream) {
        void playMediaElement(video).catch(() => undefined);
      }
    }
    const hlsHost = this.renderRoot.querySelector(".hls-host");
    const hlsVideo = this._hlsSnapshot.video;
    if (hlsHost && hlsVideo && hlsVideo.parentElement !== hlsHost) {
      hlsVideo.setAttribute("aria-label", "Live camera");
      this._applyMuteToElement(hlsVideo, this._muted);
      hlsHost.append(hlsVideo);
      void playMediaElement(hlsVideo).catch(() => undefined);
    }
    this._applyMediaMuteState();
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
    if (!this._connectionResolver.webRtcEligible) {
      this._releaseWebRtcLease();
      this._syncHlsLease();
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
          this._resetPresentedTransport();
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
    const key = this._connectionResolver.hlsSessionKey(this._entityId);
    if (this._hlsLease?.key === key) {
      return;
    }
    this._releaseHlsLease();
    const options = {
      initialMuted: this._muted,
      onVideo: this._attachConnectingHlsVideo,
    };
    this._hlsLease = this._connectionResolver.acquireHls(
      this._api,
      this._entityId,
      options,
    );
    this._hlsUnsubscribe = this._hlsLease.subscribe((snapshot) => {
      this._hlsSnapshot = snapshot;
      if (snapshot.video && snapshot.state === "connecting") {
        this._attachConnectingHlsVideo(snapshot.video);
      }
      if (snapshot.state === "live" && !this._selected) {
        this._selected = "hls";
        this._captureAutoplayFallback(snapshot.video);
        this._setPresentedTransport(snapshot.transport);
        this._setActiveVideo(snapshot.video);
        snapshot.timing?.mark("presentation_selected");
      } else if (snapshot.state === "failed" && this._selected === "hls") {
        this._selected = undefined;
        this._resetPresentedTransport();
        this._setActiveVideo(undefined);
      }
      this.requestUpdate();
    });
  }

  private _releaseLeases(): void {
    this._selected = undefined;
    this._resetPresentedTransport();
    this._setActiveVideo(undefined);
    this._webRtcDecoded = false;
    this._releaseWebRtcLease();
    this._releaseHlsLease();
  }

  private readonly _attachConnectingHlsVideo = (
    video: HTMLVideoElement,
  ): void => {
    const host = this.renderRoot.querySelector(".hls-host");
    if (!host || !this.isConnected) return;
    video.setAttribute("aria-label", "Live camera");
    this._applyMuteToElement(video, this._muted);
    if (video.parentElement !== host) host.append(video);
  };

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
    this._setPresentedTransport("webrtc");
    this._selected = "webrtc";
    this._setActiveVideo(event.currentTarget as HTMLVideoElement);
    this._releaseHlsLease(true);
    this.requestUpdate();
  };

  private _setActiveVideo(video: HTMLVideoElement | undefined): void {
    if (this._activeVideo === video) {
      return;
    }
    if (this._activeVideo) {
      setMediaElementRuntimeMuted(this._activeVideo, true);
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
    if (video && this._explicitMutePreference) {
      setMediaElementDefaultMuted(video, this._desiredMuted);
    }
    suppressNativePictureInPicture(video);
    this._syncControlState();
    this._syncEffectiveMute(
      Boolean(video) && this._mediaPresentation.requestsPlaybackOnSelection,
    );
  }

  private _setPresentedTransport(transport: MediaTransport | undefined): void {
    if (!transport || this._presentedTransport === transport) {
      return;
    }
    this._presentedTransport = transport;
    this._sourceIntroduction.revealFor();
  }

  private _resetPresentedTransport(): void {
    this._presentedTransport = undefined;
    this._clearSourceIntroduction();
  }

  private _clearSourceIntroduction(): void {
    this._sourceIntroduction.hide();
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

  private readonly _handleFullscreenChange = (): void => {
    const documentObject = document as FullscreenDocument;
    this._fullscreenLifecycle.handleDocumentFullscreenChange(
      document.fullscreenElement ??
        documentObject.webkitFullscreenElement ??
        null,
    );
    this._syncControlState();
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

  private _syncMutePreference(): void {
    this._autoplayBlocked = false;
    this._dismissToast();
    this._explicitMutePreference = false;
    if (!this._entityId) {
      this._desiredMuted = true;
    } else {
      const startUnmuted = this._clientEnvironment.isPhone
        ? this._startUnmutedPhone
        : this._startUnmutedPcTablet;
      const manager = getMediaSessionManager();
      this._explicitMutePreference =
        manager.getCameraMutePreference(this._entityId) !== undefined;
      this._desiredMuted = manager.getCameraMuted(
        this._entityId,
        !startUnmuted,
      );
    }
    this._syncEffectiveMute(false);
  }

  private readonly _handleVisibilityChange = (): void => {
    this._syncEffectiveMute(document.visibilityState === "visible");
  };

  private _syncEffectiveMute(attemptPlayback: boolean): void {
    const muted =
      this._desiredMuted || this._autoplayBlocked || documentIsHidden();
    const changed = muted !== this._muted;
    this._muted = muted;
    this._applyMediaMuteState();
    if (changed) this.requestUpdate();
    if (!muted && attemptPlayback && this._activeVideo) {
      void this._requestPlayback(this._activeVideo);
    }
  }

  private _applyMediaMuteState(): void {
    const webRtcVideo =
      this.shadowRoot?.querySelector<HTMLVideoElement>("video.webrtc");
    if (webRtcVideo) {
      this._applyMuteToElement(
        webRtcVideo,
        this._selected && this._selected !== "webrtc" ? true : this._muted,
      );
    }
    if (this._hlsSnapshot.video) {
      this._applyMuteToElement(
        this._hlsSnapshot.video,
        this._selected === "webrtc" ? true : this._muted,
      );
    }
  }

  private _applyMuteToElement(video: HTMLVideoElement, muted: boolean): void {
    setMediaElementRuntimeMuted(video, muted);
  }

  private _captureAutoplayFallback(video: HTMLVideoElement | undefined): void {
    if (!video || this._desiredMuted || documentIsHidden() || !video.muted) {
      return;
    }
    this._autoplayBlocked = true;
    this._showToast(
      "The browser blocked unmuted playback. Tap the audio button to retry.",
      "warning",
    );
    this._syncEffectiveMute(false);
  }

  private async _requestPlayback(video: HTMLVideoElement): Promise<void> {
    this._applyMuteToElement(video, this._muted);
    try {
      await playMediaElement(video);
    } catch (error) {
      if (
        this._activeVideo !== video ||
        this._desiredMuted ||
        documentIsHidden() ||
        !isAutoplayDenied(error)
      ) {
        return;
      }
      this._autoplayBlocked = true;
      this._showToast(
        "The browser blocked unmuted playback. Tap the audio button to retry.",
        "warning",
      );
      this._syncEffectiveMute(false);
      // Autoplay denial applies to audible playback, not to the live stream.
      // The selected host pipeline resumes the same retained element without
      // reconnecting. A host pipeline may retry audible output only after its
      // native element is playing; ordinary clients remain on muted recovery.
      if (this._activeVideo === video && video.muted) {
        const audible =
          await this._connectionResolver.recoverAudibleAutoplay(video);
        if (
          audible &&
          this._activeVideo === video &&
          !this._desiredMuted &&
          !documentIsHidden()
        ) {
          this._autoplayBlocked = false;
          this._dismissToast();
          this._syncEffectiveMute(false);
        }
      }
    }
  }

  private readonly _handleCameraControl = (
    event: CustomEvent<CameraControlEventDetail>,
  ): void => {
    this._dismissToast();
    if (event.detail.action === "mute") {
      this._desiredMuted = !this._muted;
      this._autoplayBlocked = false;
      this._explicitMutePreference = true;
      if (this._entityId) {
        getMediaSessionManager().setCameraMuted(
          this._entityId,
          this._desiredMuted,
        );
      }
      if (this._activeVideo) {
        setMediaElementDefaultMuted(this._activeVideo, this._desiredMuted);
      }
      this._syncEffectiveMute(!this._desiredMuted);
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
      this._showToast(
        error instanceof Error
          ? error.message
          : "Unable to change Picture-in-Picture mode.",
        "error",
      );
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
        this._fullscreenLifecycle.beginDocumentFullscreen(this._activeVideo);
        await target.requestFullscreen();
      } else if (target?.webkitRequestFullscreen) {
        this._fullscreenLifecycle.beginDocumentFullscreen(this._activeVideo);
        await target.webkitRequestFullscreen();
      } else {
        const video = this._activeVideo as FullscreenVideo | undefined;
        const enter =
          video?.webkitEnterFullscreen ?? video?.webkitEnterFullScreen;
        if (!video || !enter) {
          throw new Error("Fullscreen is not supported on this device.");
        }
        this._fullscreenLifecycle.beginNativeFullscreen(video);
        enter.call(video);
      }
      this._syncControlState();
    } catch (error) {
      this._fullscreenLifecycle.cancel();
      this._showToast(
        error instanceof Error
          ? error.message
          : "Unable to change fullscreen mode.",
        "error",
      );
    }
  }

  private _showToast(message: string, category: "error" | "warning"): void {
    const show = (): void => {
      this.shadowRoot
        ?.querySelector<ToastElement>("watchzone-toast")
        ?.show(message, { category });
    };
    show();
    if (!this.shadowRoot?.querySelector("watchzone-toast")) {
      void this.updateComplete.then(show);
    }
  }

  private _dismissToast(): void {
    this.shadowRoot?.querySelector<ToastElement>("watchzone-toast")?.dismiss();
  }

  static styles = cameraLiveViewStyles;
}

if (!customElements.get(CAMERA_LIVE_VIEW_TAG)) {
  customElements.define(CAMERA_LIVE_VIEW_TAG, CameraLiveView);
}

declare global {
  interface HTMLElementTagNameMap {
    "watchzone-camera-live-view": CameraLiveView;
  }
}
