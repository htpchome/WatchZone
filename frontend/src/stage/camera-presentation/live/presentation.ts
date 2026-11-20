import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  CAMERA_CONTROLS_TAG,
  CAMERA_GESTURE_LOCK_EVENT,
  CAMERA_LIVE_PRESENTATION_TAG,
  CAMERA_OVERLAY_VISIBILITY_EVENT,
  BADGE_TAG,
  MEDIA_OVERLAY_INTERACTION_EVENT,
  TOAST_REGION_TAG,
} from "../../../core/constants";
import {
  playMediaElement,
  setMediaElementMuted,
} from "../../../core/media-playback";
import type { MediaTransport } from "../../../core/media-session-manager";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import { DeviceProfileController } from "../../../core/device-profile";
import type { ToastNotice, ToastSeverity } from "../../../ui/toast-manager";
import "../../../ui/badge";
import "../../../ui/toast-region";
import type {
  CameraControlAction,
  CameraControlEventDetail,
} from "../controls-overlay";
import "../controls-overlay";
import { mediaOverlayBadgeSizingStyles } from "../../../ui/overlay-control.styles";
import { cameraLiveViewStyles } from "../live-view.styles";
import {
  isPictureInPictureActive,
  refreshNativePictureInPictureSuppression,
  suppressNativePictureInPicture,
} from "../../../core/picture-in-picture";
import { ZoomController } from "../../../ui/zoom";
import { MediaOverlayVisibilityController } from "../../../ui/media-overlay-visibility.controller";
import type { PresentedSource } from "./session.controller";
import { CameraLiveControlController } from "./control.controller";
import { captureVideoFrame } from "./frame-capture";
import { mediaTransportLabel } from "./source-label";
import { renderCameraSuspendedPresentation } from "../suspended-presentation";
import {
  OwnedMotion,
  reducedMotionRequested,
  VisibilityMotion,
} from "../../../ui/motion";

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
const mediaOverlayInteractionEvent = unsafeStatic(
  MEDIA_OVERLAY_INTERACTION_EVENT,
);
const badgeTag = unsafeStatic(BADGE_TAG);
const toastRegionTag = unsafeStatic(TOAST_REGION_TAG);

/** Renders one camera's live presentation and owns browser presentation APIs. */
export class CameraLivePresentation extends LitElement {
  public static properties = {
    active: { attribute: false, type: Boolean },
    available: { attribute: false, type: Boolean },
    controlsEnabled: { attribute: false, type: Boolean },
    externalOverlayVisible: { attribute: false, type: Boolean },
    failed: { attribute: false, type: Boolean },
    fallbackVideo: { attribute: false },
    lowLatencyHls: { attribute: false, type: Boolean },
    localize: { attribute: false },
    muted: { attribute: false, type: Boolean },
    notices: { attribute: false },
    overlayInteractionEnabled: { attribute: false, type: Boolean },
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
  private _disconnectGeneration = 0;
  private _posterDimensions?: MediaDimensions;
  private _posterFailed = false;
  private _reportedGestureLocked = false;
  private _webRtcFrameRequest?: number;
  private readonly _sourceVisibilityMotion = new VisibilityMotion();
  private readonly _spinnerMotion = new OwnedMotion();
  private _spinnerElement?: HTMLElement;
  private readonly _deviceProfile = new DeviceProfileController(this);
  private readonly _overlay = new MediaOverlayVisibilityController(this, {
    dismissOnOutsidePointer: true,
    onVisibilityChange: (visible) => this._emitOverlayVisibility(visible),
  });
  private readonly _zoom = new ZoomController(this, {
    onActivation: (input) => {
      if (!this.overlayInteractionEnabled) return;
      if (input === "touch") this._overlay.revealFromTouch();
      else this._overlay.reveal();
    },
    onTouchInteraction: () => {
      if (this.overlayInteractionEnabled) this._overlay.revealFromTouch();
    },
  });
  private readonly _controls = new CameraLiveControlController(this, {
    captureFrame: () => this.captureFrame(),
    getFullscreenTarget: () =>
      this.renderRoot.querySelector<HTMLElement>(".viewport") ?? undefined,
    getLocalize: () => this.localize,
    getSnapshotKey: () => this.zoomKey,
    onFullscreenExit: () => this._restoreActiveVideoAfterFullscreen(),
    onMuteToggle: () =>
      this.dispatchEvent(
        new CustomEvent("camera-mute-toggle", {
          bubbles: true,
          composed: true,
        }),
      ),
    onSuspendToggle: () =>
      this.dispatchEvent(
        new CustomEvent("camera-suspend-toggle", {
          bubbles: true,
          composed: true,
        }),
      ),
    requestToast: (severity, message, key) =>
      this._requestToast(severity, message, key),
  });

  public active = true;
  public available = false;
  public controlsEnabled = true;
  public externalOverlayVisible = false;
  public failed = false;
  public fallbackVideo?: HTMLVideoElement;
  public lowLatencyHls = true;
  public localize: LocalizeFunction = englishLocalize;
  public muted = true;
  public notices: readonly ToastNotice[] = [];
  public overlayInteractionEnabled = true;
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

  public get activeVideo(): HTMLVideoElement | undefined {
    return this._activeVideo;
  }

  public get snapshotPending(): boolean {
    return this._controls.snapshotPending;
  }

  public captureFrame(): Promise<Blob> {
    if (!this._activeVideo) {
      return Promise.reject(new Error("The live frame is not ready yet."));
    }
    return captureVideoFrame(this._activeVideo);
  }

  public performControl(action: CameraControlAction): void {
    this._controls.perform(action);
  }

  public beginStageResizeReturn(): void {
    this._zoom.beginStageResizeReturn();
  }

  public updateStageResizeReturn(progress: number): void {
    this._zoom.updateStageResizeReturn(progress);
  }

  public endStageResizeReturn(): void {
    this._zoom.endStageResizeReturn();
    this._overlay.hide();
  }

  public setBasePresentationScale(scale: number): void {
    this._zoom.setBasePresentationScale(scale);
  }

  public revealOverlay(): void {
    this._overlay.reveal();
  }

  public holdOverlay(): () => void {
    return this._overlay.hold();
  }

  public zoomDisplay(direction: "in" | "out"): void {
    this._zoom.zoomBy(direction);
  }

  public connectedCallback(): void {
    this._disconnectGeneration += 1;
    super.connectedCallback();
    document.addEventListener("visibilitychange", this._handleVisibilityChange);
  }

  public disconnectedCallback(): void {
    document.removeEventListener(
      "visibilitychange",
      this._handleVisibilityChange,
    );
    const generation = ++this._disconnectGeneration;
    // Preserve the decoded WebRTC frame across a synchronous DOM reparent.
    // A presentation that remains disconnected still detaches immediately
    // after the current task, so route changes retain no element-owned work.
    queueMicrotask(() => {
      if (this.isConnected || generation !== this._disconnectGeneration) return;
      this._cancelWebRtcFrameRequest();
      this._detachWebRtcVideo();
      this._setActiveVideo(undefined);
    });
    this._sourceVisibilityMotion.disconnect();
    this._spinnerMotion.cancel();
    this._spinnerElement = undefined;
    super.disconnectedCallback();
  }

  private readonly _handleVisibilityChange = (): void => {
    if (document.visibilityState !== "visible" || !this._activeVideo) return;
    void playMediaElement(this._activeVideo).catch(() => undefined);
  };

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("active")) this._zoom.setActive(this.active);
    if (changed.has("posterUrl")) {
      this._posterDimensions = undefined;
      this._posterFailed = false;
    }
    if (changed.has("transport") && this.transport)
      this._overlay.revealSource();
    if (changed.has("zoomKey")) this._zoom.configure(this.zoomKey);
    if (changed.has("suspended") && this.suspended) this._zoom.resetZoom();
    if (changed.has("active") || changed.has("overlayInteractionEnabled")) {
      this._overlay.setActive(this.active && this.overlayInteractionEnabled);
    }
  }

  protected render() {
    const sourceLabel =
      mediaTransportLabel(this.transport, this.lowLatencyHls) ?? "HLS";
    const connecting =
      !this.suspended && this.available && !this.failed && !this.selected;
    const resolvedSource = Boolean(
      !this.suspended && this.selected && this.transport,
    );
    const sourceVisible = Boolean(
      connecting ||
      (resolvedSource &&
        (this.externalOverlayVisible ||
          this._overlay.sourceVisible ||
          this._overlay.visible)),
    );
    return staticHtml`
      <div
        class="viewport"
        tabindex="0"
        aria-label=${this.localize("camera.live_view_zoom", {
          percent: Math.round(this._zoom.scale * 100),
        })}
        aria-keyshortcuts="Enter Space + - 0 Escape ArrowLeft ArrowRight ArrowUp ArrowDown"
        @pointerenter=${this._handlePointerEnter}
        @pointerleave=${this._handlePointerLeave}
        @pointerdown=${this._handlePointerDown}
        @pointermove=${this._handlePointerMove}
        @pointerup=${this._handlePointerEnd}
        @pointercancel=${this._handlePointerEnd}
        @focusin=${this._handleFocusIn}
        @focusout=${this._handleFocusOut}
      >
        <div class="media-surface">
          ${
            this.suspended
              ? renderCameraSuspendedPresentation(this.localize)
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
          this.controlsEnabled && (this.selected || this.suspended)
            ? staticHtml`<${controlsTag}
                class="player-tools swiper-no-swiping"
                .visible=${this.suspended || this._overlay.visible}
                .fullscreenActive=${this._controls.fullscreenActive}
                .fullscreenSupported=${this._controls.fullscreenSupported()}
                .muted=${this.muted}
                .localize=${this.localize}
                .pictureInPictureActive=${this._controls.pictureInPictureActive}
                .pictureInPictureSupported=${this._controls.pictureInPictureSupported(
                  this._selectedVideoForRender,
                )}
                .snapshotPending=${this._controls.snapshotPending}
                .suspendPending=${this.suspendPending}
                .suspendSupported=${this.suspendSupported}
                .suspended=${this.suspended}
                @camera-control=${this._handleCameraControl}
                @${mediaOverlayInteractionEvent}=${this._handleOverlayControlInteraction}
              ></${controlsTag}>`
            : nothing
        }
        <${toastRegionTag} .notices=${this.notices}></${toastRegionTag}>
      </div>
    `;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    const sourceIndicator =
      this.renderRoot.querySelector<HTMLElement>(".source-indicator") ??
      undefined;
    this._sourceVisibilityMotion.update(
      sourceIndicator,
      sourceIndicator?.classList.contains("visible") ?? false,
    );
    const spinner =
      this.renderRoot.querySelector<HTMLElement>(".connection-spinner") ??
      undefined;
    if (spinner !== this._spinnerElement) {
      this._spinnerMotion.cancel();
      this._spinnerElement = spinner;
      if (spinner && !reducedMotionRequested()) {
        this._spinnerMotion.start(
          spinner,
          { transform: ["rotate(0deg)", "rotate(360deg)"] },
          { duration: 0.8, ease: "linear", repeat: Infinity },
        );
      }
    }
    const viewport =
      this.renderRoot.querySelector<HTMLElement>(".viewport") ?? undefined;
    this._zoom.attach(
      viewport,
      this.renderRoot.querySelector<HTMLElement>(".media-surface") ?? undefined,
    );
    this._overlay.attach(viewport);
    const gestureLocked = this._zoom.pannable;
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
      this.fallbackVideo.parentElement !== hlsHost &&
      !isPictureInPictureActive(this.fallbackVideo)
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

  private readonly _handleOverlayControlInteraction = (): void => {
    this._overlay.reveal();
  };

  private readonly _handlePointerEnter = (event: PointerEvent): void => {
    if (this.overlayInteractionEnabled) this._overlay.handlePointerEnter(event);
  };

  private readonly _handlePointerLeave = (event: PointerEvent): void => {
    if (this.overlayInteractionEnabled) this._overlay.handlePointerLeave(event);
  };

  private readonly _handlePointerDown = (event: PointerEvent): void => {
    if (this.overlayInteractionEnabled) this._overlay.handlePointerDown(event);
  };

  private readonly _handlePointerMove = (event: PointerEvent): void => {
    if (this.overlayInteractionEnabled && !this._zoom.interacting)
      this._overlay.handlePointerMove(event);
  };

  private readonly _handlePointerEnd = (event: PointerEvent): void => {
    if (this.overlayInteractionEnabled) this._overlay.handlePointerEnd(event);
  };

  private readonly _handleFocusIn = (event: FocusEvent): void => {
    if (this.overlayInteractionEnabled) this._overlay.handleFocusIn(event);
  };

  private readonly _handleFocusOut = (event: FocusEvent): void => {
    if (this.overlayInteractionEnabled) this._overlay.handleFocusOut(event);
  };

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
    this._controls.perform(event.detail.action);
  };

  private _setActiveVideo(video: HTMLVideoElement | undefined): void {
    if (this._activeVideo === video) return;
    for (const eventName of ["loadedmetadata", "resize", "emptied"]) {
      this._activeVideo?.removeEventListener(
        eventName,
        this._syncStageMediaDimensions,
      );
      video?.addEventListener(eventName, this._syncStageMediaDimensions);
    }
    this._activeVideo = video;
    this._controls.setActiveVideo(video);
    this._syncStageMediaDimensions();
  }

  private _restoreActiveVideoAfterFullscreen(): void {
    const video = this._activeVideo;
    if (!video) return;
    const host = this.renderRoot.querySelector<HTMLElement>(
      this.selected === "fallback" ? ".fallback-host" : ".webrtc-host",
    );
    if (!host) return;
    host.append(video);
    refreshNativePictureInPictureSuppression(video);
    setMediaElementMuted(video, this.muted);
    void playMediaElement(video).catch(() => undefined);
    if (this.selected === "webrtc" && this.webRtcStream) {
      this._observeWebRtcFrame(video, this.webRtcStream);
    }
    this._emitMediaAttached(video);
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
    this._zoom.setMediaDimensions(
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

  static styles = [mediaOverlayBadgeSizingStyles, cameraLiveViewStyles];
}

if (!customElements.get(CAMERA_LIVE_PRESENTATION_TAG)) {
  customElements.define(CAMERA_LIVE_PRESENTATION_TAG, CameraLivePresentation);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_LIVE_PRESENTATION_TAG]: CameraLivePresentation;
  }
}
