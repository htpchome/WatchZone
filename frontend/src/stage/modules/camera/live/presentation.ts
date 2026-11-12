import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  CAMERA_CONTROLS_TAG,
  CAMERA_GESTURE_LOCK_EVENT,
  CAMERA_LIVE_PRESENTATION_TAG,
  CAMERA_OVERLAY_VISIBILITY_EVENT,
  BADGE_TAG,
  TOAST_REGION_TAG,
} from "../../../../core/constants";
import {
  playMediaElement,
  setMediaElementMuted,
} from "../../../../core/media-playback";
import {
  isMediaFullscreenActive,
  mediaFullscreenSupported,
  toggleMediaFullscreen,
} from "../../../../core/fullscreen";
import type { MediaTransport } from "../../../../core/media-session-manager";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../../core/localization";
import type { ToastNotice, ToastSeverity } from "../../../../ui/toast-manager";
import { renderIcon } from "../../../../ui/icons";
import "../../../../ui/badge";
import "../../../../ui/toast-region";
import type { CameraControlEventDetail } from "../controls-overlay";
import "../controls-overlay";
import { cameraLiveViewStyles } from "../live-view.styles";
import {
  isPictureInPictureActive,
  pictureInPictureMethod,
  refreshNativePictureInPictureSuppression,
  suppressNativePictureInPicture,
  togglePictureInPicture,
} from "../../../../core/picture-in-picture";
import { MediaPresentationController } from "../../../../ui/media-presentation.controller";
import type { PresentedSource } from "./session.controller";
import { captureVideoFrame, downloadSnapshot } from "./frame-capture";

interface MediaDimensions {
  readonly height: number;
  readonly width: number;
}

export interface CameraMediaAttachedDetail {
  readonly video: HTMLVideoElement;
}

export type CameraMediaDimensionsDetail = MediaDimensions;

export interface CameraToastRequestDetail {
  readonly key: string;
  readonly message: string;
  readonly severity: ToastSeverity;
}

export interface CameraGestureLockDetail {
  readonly key?: string;
  readonly locked: boolean;
}

export interface CameraOverlayVisibilityDetail {
  readonly key: string;
  readonly visible: boolean;
}

const controlsTag = unsafeStatic(CAMERA_CONTROLS_TAG);
const badgeTag = unsafeStatic(BADGE_TAG);
const toastRegionTag = unsafeStatic(TOAST_REGION_TAG);

/** Renders one camera's live presentation and owns browser presentation APIs. */
export class CameraLivePresentation extends LitElement {
  public static properties = {
    available: { attribute: false, type: Boolean },
    failed: { attribute: false, type: Boolean },
    fallbackVideo: { attribute: false },
    lowLatencyHls: { attribute: false, type: Boolean },
    localize: { attribute: false },
    muted: { attribute: false, type: Boolean },
    notices: { attribute: false },
    posterUrl: { attribute: false },
    posterPriority: { attribute: false, type: Boolean },
    selected: { attribute: false },
    sessionRevision: { attribute: false, type: Number },
    suspendPending: { attribute: false, type: Boolean },
    suspendSupported: { attribute: false, type: Boolean },
    suspended: { attribute: false, type: Boolean },
    transport: { attribute: false },
    webRtcMedia: { attribute: false },
    webRtcStream: { attribute: false },
    zoomKey: { attribute: false },
  };

  private _activeVideo?: HTMLVideoElement;
  private _attachedWebRtcVideo?: HTMLVideoElement;
  private _fullscreenActive = false;
  private _pictureInPictureActive = false;
  private _posterDimensions?: MediaDimensions;
  private _posterFailed = false;
  private _reportedGestureLocked = false;
  private _snapshotPending = false;
  private _webRtcFrameRequest?: number;
  private readonly _media = new MediaPresentationController(this, {
    dismissOverlayOnOutsidePointer: true,
    onVisibilityChange: (visible) => this._emitOverlayVisibility(visible),
  });

  public available = false;
  public failed = false;
  public fallbackVideo?: HTMLVideoElement;
  public lowLatencyHls = true;
  public localize: LocalizeFunction = englishLocalize;
  public muted = true;
  public notices: readonly ToastNotice[] = [];
  public posterUrl?: string;
  public posterPriority = false;
  public selected?: PresentedSource;
  public sessionRevision = 0;
  public suspendPending = false;
  public suspendSupported = false;
  public suspended = false;
  public transport?: MediaTransport;
  public webRtcMedia?: HTMLVideoElement;
  public webRtcStream?: MediaStream;
  public zoomKey?: string;

  public get webRtcVideo(): HTMLVideoElement | undefined {
    return this._attachedWebRtcVideo ?? this.webRtcMedia;
  }

  public beginStageResizeReturn(): void {
    this._media.zoom.beginStageResizeReturn();
  }

  public updateStageResizeReturn(progress: number): void {
    this._media.zoom.updateStageResizeReturn(progress);
  }

  public endStageResizeReturn(): void {
    this._media.endStageResizeReturn();
  }

  public setBasePresentationScale(scale: number): void {
    this._media.zoom.setBasePresentationScale(scale);
  }

  public revealOverlay(): void {
    this._media.overlay.reveal();
  }

  public holdOverlay(): () => void {
    return this._media.overlay.hold();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("fullscreenchange", this._syncControlState);
    document.addEventListener("webkitfullscreenchange", this._syncControlState);
  }

  public disconnectedCallback(): void {
    document.removeEventListener("fullscreenchange", this._syncControlState);
    document.removeEventListener(
      "webkitfullscreenchange",
      this._syncControlState,
    );
    this._cancelWebRtcFrameRequest();
    this._detachWebRtcVideo();
    this._setActiveVideo(undefined);
    super.disconnectedCallback();
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("posterUrl")) {
      this._posterDimensions = undefined;
      this._posterFailed = false;
    }
    if (changed.has("transport") && this.transport)
      this._media.overlay.revealSource();
    if (changed.has("zoomKey")) this._media.configure(this.zoomKey);
    if (changed.has("suspended") && this.suspended) this._media.resetZoom();
  }

  protected render() {
    const hlsLabel = this.lowLatencyHls ? "HLS-LL" : "HLS";
    const sourceLabel =
      this.transport === "webrtc"
        ? "WebRTC"
        : this.transport === "mse"
          ? "MSE"
          : this.transport === "hls_native"
            ? `${hlsLabel} · native`
            : this.transport === "hls_mse"
              ? `${hlsLabel} · HLS.js`
              : hlsLabel;
    const connecting =
      !this.suspended && this.available && !this.failed && !this.selected;
    const resolvedSource = Boolean(
      !this.suspended && this.selected && this.transport,
    );
    const sourceVisible = Boolean(
      connecting ||
      (resolvedSource &&
        (this._media.overlay.sourceVisible || this._media.overlay.visible)),
    );
    return staticHtml`
      <div
        class="viewport"
        tabindex="0"
        aria-label=${this.localize("camera.live_view_zoom", {
          percent: Math.round(this._media.zoom.scale * 100),
        })}
        aria-keyshortcuts="Enter Space + - 0 Escape ArrowLeft ArrowRight ArrowUp ArrowDown"
        @keydown=${this._media.handleKeyDown}
        @pointerenter=${this._media.overlay.handlePointerEnter}
        @pointerleave=${this._media.overlay.handlePointerLeave}
        @pointermove=${this._media.handlePointerMove}
        @pointerdown=${this._media.handlePointerDown}
        @pointerup=${this._media.handlePointerUp}
        @pointercancel=${this._media.handlePointerCancel}
        @lostpointercapture=${this._media.handleLostPointerCapture}
        @focusin=${this._media.overlay.handleFocusIn}
        @focusout=${this._media.overlay.handleFocusOut}
        @wheel=${this._media.handleWheel}
      >
        <div
          class=${[
            "media-surface",
            this._media.zoom.pannable ? "pannable" : "",
            this._media.zoom.interacting ? "interacting" : "",
            this._media.zoom.stageResizeActive ? "stage-resize-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style=${`transform: ${this._media.zoom.transform}`}
        >
          ${
            this.suspended
              ? this._renderSuspended()
              : html`${!this.selected ? this._renderFallback() : nothing}
                  <div
                    class=${
                      this.selected === "fallback"
                        ? "fallback-host"
                        : "fallback-host candidate"
                    }
                    ?hidden=${this.selected === "webrtc"}
                    aria-hidden=${this.selected === "fallback" ? "false" : "true"}
                  ></div>
                  <div class="webrtc-host"></div>`
          }
        </div>
        ${
          connecting || resolvedSource
            ? staticHtml`<${badgeTag}
                class=${
                  sourceVisible
                    ? "source-indicator visible"
                    : "source-indicator"
                }
                role="status"
                shape="pill"
                size="small"
                variant="neutral"
                aria-live="polite"
                aria-hidden=${sourceVisible ? "false" : "true"}
                aria-label=${
                  resolvedSource
                    ? this.localize("camera.live_source", {
                        source: sourceLabel,
                      })
                    : this.localize("camera.connecting_label")
                }
              >
                ${
                  resolvedSource
                    ? sourceLabel
                    : html`<span
                          class="connection-spinner"
                          aria-hidden="true"
                        ></span>
                        <span>${this.localize("camera.connecting")}</span>`
                }
              </${badgeTag}>`
            : nothing
        }
        ${
          this.selected || this.suspended
            ? staticHtml`<${controlsTag}
                class="swiper-no-swiping"
                .visible=${this.suspended || this._media.overlay.visible}
                .fullscreenActive=${this._fullscreenActive}
                .fullscreenSupported=${this._fullscreenSupported()}
                .muted=${this.muted}
                .localize=${this.localize}
                .pictureInPictureActive=${this._pictureInPictureActive}
                .pictureInPictureSupported=${Boolean(
                  pictureInPictureMethod(this._selectedVideoForRender),
                )}
                .snapshotPending=${this._snapshotPending}
                .suspendPending=${this.suspendPending}
                .suspendSupported=${this.suspendSupported}
                .suspended=${this.suspended}
                @camera-control=${this._handleCameraControl}
              ></${controlsTag}>`
            : nothing
        }
        <${toastRegionTag} .notices=${this.notices}></${toastRegionTag}>
      </div>
    `;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    this._media.observe(
      this.renderRoot.querySelector<HTMLElement>(".viewport") ?? undefined,
    );
    const gestureLocked = this._media.zoom.pannable;
    if (gestureLocked !== this._reportedGestureLocked) {
      this._reportedGestureLocked = gestureLocked;
      this.dispatchEvent(
        new CustomEvent<CameraGestureLockDetail>(CAMERA_GESTURE_LOCK_EVENT, {
          bubbles: true,
          composed: true,
          detail: { key: this.zoomKey, locked: gestureLocked },
        }),
      );
    }
    this._syncWebRtcVideo();
    const webRtcVideo = this.webRtcVideo;
    const hlsHost = this.renderRoot.querySelector(".fallback-host");
    if (
      hlsHost &&
      this.fallbackVideo &&
      this.fallbackVideo.parentElement !== hlsHost
    ) {
      this.fallbackVideo.setAttribute(
        "aria-label",
        this.localize("camera.live"),
      );
      suppressNativePictureInPicture(this.fallbackVideo);
      setMediaElementMuted(this.fallbackVideo, this.muted);
      hlsHost.append(this.fallbackVideo);
      this._emitMediaAttached(this.fallbackVideo);
    }
    this._setActiveVideo(
      this.selected === "fallback"
        ? this.fallbackVideo
        : this.selected === "webrtc"
          ? webRtcVideo
          : undefined,
    );
    if (changed.has("selected") && this.selected === "webrtc") {
      this.dispatchEvent(
        new CustomEvent("camera-webrtc-presented", {
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private _renderFallback() {
    return html`<div class="generic-fallback" aria-hidden="true">
        <svg viewBox="0 0 64 64">
          <path
            d="M11 20.5h30a5 5 0 0 1 5 5v18a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5v-18a5 5 0 0 1 5-5Z"
          />
          <path d="m46 29 10-6v23l-10-6" />
          <circle cx="26" cy="34.5" r="8" />
        </svg>
      </div>
      ${
        this.posterUrl && !this._posterFailed
          ? html`<img
              class="fallback-image poster"
              src=${this.posterUrl}
              alt=""
              aria-hidden="true"
              decoding="async"
              draggable="false"
              fetchpriority=${this.posterPriority ? "high" : "auto"}
              loading=${this.posterPriority ? "eager" : "lazy"}
              @load=${this._handlePosterLoaded}
              @error=${() => {
                this._posterDimensions = undefined;
                this._syncStageMediaDimensions();
                this._posterFailed = true;
                this.requestUpdate();
              }}
            />`
          : nothing
      }`;
  }

  private _emitOverlayVisibility(visible: boolean): void {
    if (!this.zoomKey) return;
    this.dispatchEvent(
      new CustomEvent<CameraOverlayVisibilityDetail>(
        CAMERA_OVERLAY_VISIBILITY_EVENT,
        {
          bubbles: true,
          composed: true,
          detail: { key: this.zoomKey, visible },
        },
      ),
    );
  }

  private _renderSuspended() {
    return html`<div class="suspended-presentation" role="status">
      <span class="suspended-icon" aria-hidden="true"
        >${renderIcon("videoOff")}</span
      >
      <strong>${this.localize("camera.suspended")}</strong>
      <span>${this.localize("camera.suspended_description")}</span>
    </div>`;
  }

  private _emitMediaAttached(video: HTMLVideoElement): void {
    void playMediaElement(video).catch(() => undefined);
    this.dispatchEvent(
      new CustomEvent<CameraMediaAttachedDetail>("camera-media-attached", {
        bubbles: true,
        composed: true,
        detail: { video },
      }),
    );
  }

  private readonly _handleWebRtcDecoded = (event: Event): void => {
    this._emitWebRtcDecoded(event.currentTarget as HTMLVideoElement);
  };

  private _syncWebRtcVideo(): void {
    const video = this.webRtcMedia;
    if (this._attachedWebRtcVideo !== video) {
      this._detachWebRtcVideo();
      this._attachedWebRtcVideo = video;
      for (const eventName of ["canplay", "loadeddata", "playing"]) {
        video?.addEventListener(eventName, this._handleWebRtcDecoded);
      }
    }
    if (!video) return;
    video.className =
      this.selected === "webrtc" ? "webrtc" : "webrtc candidate";
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("controlslist", "nopictureinpicture");
    video.setAttribute("aria-label", this.localize("camera.live"));
    video.setAttribute(
      "aria-hidden",
      this.selected === "webrtc" ? "false" : "true",
    );
    suppressNativePictureInPicture(video);
    setMediaElementMuted(video, this.selected === "webrtc" ? this.muted : true);
    const host = this.renderRoot.querySelector<HTMLElement>(".webrtc-host");
    if (host && video.parentElement !== host) {
      host.append(video);
      if (this.webRtcStream) {
        this._observeWebRtcFrame(video, this.webRtcStream);
        this._emitMediaAttached(video);
      }
    }
  }

  private _detachWebRtcVideo(): void {
    const video = this._attachedWebRtcVideo;
    if (!video) return;
    this._cancelWebRtcFrameRequest(video);
    for (const eventName of ["canplay", "loadeddata", "playing"]) {
      video.removeEventListener(eventName, this._handleWebRtcDecoded);
    }
    video.remove();
    this._attachedWebRtcVideo = undefined;
  }

  private _emitWebRtcDecoded(video: HTMLVideoElement): void {
    this._cancelWebRtcFrameRequest(video);
    refreshNativePictureInPictureSuppression(video);
    this.dispatchEvent(
      new CustomEvent<HTMLVideoElement>("camera-webrtc-decoded", {
        bubbles: true,
        composed: true,
        detail: video,
      }),
    );
  }

  private _observeWebRtcFrame(
    video: HTMLVideoElement,
    stream: MediaStream,
  ): void {
    if (typeof video.requestVideoFrameCallback !== "function") return;
    this._webRtcFrameRequest = video.requestVideoFrameCallback(() => {
      this._webRtcFrameRequest = undefined;
      if (
        video === this.webRtcMedia &&
        video.srcObject === stream &&
        this.webRtcStream === stream
      ) {
        this._emitWebRtcDecoded(video);
      }
    });
  }

  private _cancelWebRtcFrameRequest(video = this.webRtcVideo): void {
    if (this._webRtcFrameRequest === undefined || !video) return;
    video.cancelVideoFrameCallback?.(this._webRtcFrameRequest);
    this._webRtcFrameRequest = undefined;
  }

  private readonly _handleCameraControl = (
    event: CustomEvent<CameraControlEventDetail>,
  ): void => {
    if (event.detail.action === "mute") {
      this.dispatchEvent(
        new CustomEvent("camera-mute-toggle", {
          bubbles: true,
          composed: true,
        }),
      );
    } else if (event.detail.action === "picture_in_picture") {
      void this._togglePictureInPicture();
    } else if (event.detail.action === "fullscreen") {
      void this._toggleFullscreen();
    } else if (event.detail.action === "snapshot") {
      void this._takeSnapshot();
    } else if (event.detail.action === "suspend") {
      this.dispatchEvent(
        new CustomEvent("camera-suspend-toggle", {
          bubbles: true,
          composed: true,
        }),
      );
    }
  };

  private async _takeSnapshot(): Promise<void> {
    if (!this._activeVideo || this._snapshotPending) return;
    this._snapshotPending = true;
    this.requestUpdate();
    try {
      downloadSnapshot(
        await captureVideoFrame(this._activeVideo),
        this.zoomKey,
      );
      this._requestToast(
        "success",
        this.localize("camera.snapshot_downloaded"),
        "camera-snapshot",
      );
    } catch (error) {
      this._requestToast(
        "error",
        error instanceof Error
          ? error.message
          : this.localize("camera.snapshot_failed"),
        "camera-snapshot",
      );
    } finally {
      this._snapshotPending = false;
      this.requestUpdate();
    }
  }

  private _setActiveVideo(video: HTMLVideoElement | undefined): void {
    if (this._activeVideo === video) return;
    for (const eventName of [
      "enterpictureinpicture",
      "leavepictureinpicture",
      "webkitpresentationmodechanged",
      "webkitbeginfullscreen",
      "webkitendfullscreen",
      "loadedmetadata",
      "resize",
      "emptied",
    ]) {
      const handler =
        eventName === "loadedmetadata" ||
        eventName === "resize" ||
        eventName === "emptied"
          ? this._syncStageMediaDimensions
          : this._syncControlState;
      this._activeVideo?.removeEventListener(eventName, handler);
      video?.addEventListener(eventName, handler);
    }
    this._activeVideo = video;
    suppressNativePictureInPicture(video);
    this._syncControlState();
    this._syncStageMediaDimensions();
  }

  private get _selectedVideoForRender(): HTMLVideoElement | undefined {
    return this.selected === "fallback"
      ? this.fallbackVideo
      : this.selected === "webrtc"
        ? this.webRtcVideo
        : undefined;
  }

  private readonly _handlePosterLoaded = (event: Event): void => {
    const image = event.currentTarget as HTMLImageElement;
    this._posterDimensions = {
      height: image.naturalHeight,
      width: image.naturalWidth,
    };
    this._syncStageMediaDimensions();
  };

  private readonly _syncStageMediaDimensions = (): void => {
    const video = this._activeVideo;
    const dimensions =
      video && video.videoWidth > 0 && video.videoHeight > 0
        ? { height: video.videoHeight, width: video.videoWidth }
        : this._posterDimensions;
    this._media.zoom.setMediaDimensions(
      dimensions?.width ?? 0,
      dimensions?.height ?? 0,
    );
    this.dispatchEvent(
      new CustomEvent<CameraMediaDimensionsDetail>("camera-media-dimensions", {
        bubbles: true,
        composed: true,
        detail: {
          height: dimensions?.height ?? 0,
          width: dimensions?.width ?? 0,
        },
      }),
    );
  };

  private readonly _syncControlState = (): void => {
    const pictureInPictureActive = isPictureInPictureActive(this._activeVideo);
    const fullscreenActive = isMediaFullscreenActive(this._activeVideo);
    if (
      this._pictureInPictureActive === pictureInPictureActive &&
      this._fullscreenActive === fullscreenActive
    )
      return;
    this._pictureInPictureActive = pictureInPictureActive;
    this._fullscreenActive = fullscreenActive;
    this.requestUpdate();
  };

  private _fullscreenSupported(): boolean {
    return mediaFullscreenSupported(
      this.renderRoot.querySelector<HTMLElement>(".viewport"),
      this._activeVideo,
    );
  }

  private async _togglePictureInPicture(): Promise<void> {
    if (!this._activeVideo) return;
    try {
      await togglePictureInPicture(this._activeVideo);
    } catch (error) {
      this._requestToast(
        "error",
        error instanceof Error
          ? error.message
          : this.localize("camera.pip_failed"),
        "camera-picture-in-picture",
      );
    }
    this._syncControlState();
  }

  private async _toggleFullscreen(): Promise<void> {
    const target = this.renderRoot.querySelector<HTMLElement>(".viewport");
    try {
      await toggleMediaFullscreen(target, this._activeVideo);
    } catch (error) {
      this._requestToast(
        "error",
        error instanceof Error
          ? error.message
          : this.localize("camera.fullscreen_failed"),
        "camera-fullscreen",
      );
    }
    this._syncControlState();
  }

  private _requestToast(
    severity: ToastSeverity,
    message: string,
    key: string,
  ): void {
    this.dispatchEvent(
      new CustomEvent<CameraToastRequestDetail>("camera-toast-request", {
        bubbles: true,
        composed: true,
        detail: { key, message, severity },
      }),
    );
  }

  static styles = cameraLiveViewStyles;
}

if (!customElements.get(CAMERA_LIVE_PRESENTATION_TAG)) {
  customElements.define(CAMERA_LIVE_PRESENTATION_TAG, CameraLivePresentation);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_LIVE_PRESENTATION_TAG]: CameraLivePresentation;
  }
}
