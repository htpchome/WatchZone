import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  CAMERA_CONTROLS_TAG,
  CAMERA_LIVE_PRESENTATION_TAG,
  TOAST_REGION_TAG,
} from "../../../core/constants";
import {
  playMediaElement,
  setMediaElementMuted,
} from "../../../core/media-playback";
import type { MediaTransport } from "../../../core/media-session-manager";
import type { ToastNotice, ToastSeverity } from "../../../ui/toast-manager";
import "../../../ui/toast-region";
import type { CameraControlEventDetail } from "../controls-overlay";
import "../controls-overlay";
import { CameraControlsVisibilityController } from "../controls-visibility.controller";
import { cameraLiveViewStyles } from "../live-view.styles";
import {
  isPictureInPictureActive,
  pictureInPictureMethod,
  suppressNativePictureInPicture,
  togglePictureInPicture,
} from "../picture-in-picture";
import type { PresentedSource } from "./session.controller";

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

export interface CameraMediaAttachedDetail {
  readonly video: HTMLVideoElement;
}

export interface CameraToastRequestDetail {
  readonly key: string;
  readonly message: string;
  readonly severity: ToastSeverity;
}

const controlsTag = unsafeStatic(CAMERA_CONTROLS_TAG);
const toastRegionTag = unsafeStatic(TOAST_REGION_TAG);

/** Renders one camera's live presentation and owns browser presentation APIs. */
export class CameraLivePresentation extends LitElement {
  public static properties = {
    available: { attribute: false, type: Boolean },
    failed: { attribute: false, type: Boolean },
    hlsVideo: { attribute: false },
    muted: { attribute: false, type: Boolean },
    notices: { attribute: false },
    posterUrl: { attribute: false },
    selected: { attribute: false },
    sessionRevision: { attribute: false, type: Number },
    transport: { attribute: false },
    webRtcStream: { attribute: false },
  };

  private _activeVideo?: HTMLVideoElement;
  private _fullscreenActive = false;
  private _pictureInPictureActive = false;
  private _posterFailed = false;
  private readonly _visibility = new CameraControlsVisibilityController(this);

  public available = false;
  public failed = false;
  public hlsVideo?: HTMLVideoElement;
  public muted = true;
  public notices: readonly ToastNotice[] = [];
  public posterUrl?: string;
  public selected?: PresentedSource;
  public sessionRevision = 0;
  public transport?: MediaTransport;
  public webRtcStream?: MediaStream;

  public get webRtcVideo(): HTMLVideoElement | undefined {
    return (
      this.shadowRoot?.querySelector<HTMLVideoElement>("video.webrtc") ??
      undefined
    );
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
    this._setActiveVideo(undefined);
    super.disconnectedCallback();
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("posterUrl")) this._posterFailed = false;
    if (changed.has("transport") && this.transport)
      this._visibility.revealSource();
  }

  protected render() {
    const sourceLabel =
      this.transport === "webrtc"
        ? "WebRTC"
        : this.transport === "hls_native"
          ? "HLS · native"
          : this.transport === "hls_mse"
            ? "HLS · HLS.js"
            : "HLS";
    const connecting = this.available && !this.failed && !this.selected;
    const resolvedSource = Boolean(this.selected && this.transport);
    const sourceVisible = Boolean(
      connecting ||
      (resolvedSource &&
        (this._visibility.sourceVisible || this._visibility.visible)),
    );
    return staticHtml`
      <div
        class="viewport"
        tabindex="0"
        aria-label="Camera live view"
        @pointerenter=${this._visibility.handlePointerEnter}
        @pointerleave=${this._visibility.handlePointerLeave}
        @pointermove=${this._visibility.handlePointerMove}
        @pointerdown=${this._visibility.handlePointerDown}
        @focusin=${this._visibility.handleFocusIn}
        @focusout=${this._visibility.handleFocusOut}
      >
        ${!this.selected ? this._renderFallback() : nothing}
        <div class="hls-host" ?hidden=${this.selected === "webrtc"}></div>
        <video
          class=${this.selected === "webrtc" ? "webrtc" : "webrtc candidate"}
          autoplay
          playsinline
          .muted=${this.selected === "webrtc" ? this.muted : true}
          aria-label="Live camera"
          aria-hidden=${this.selected === "webrtc" ? "false" : "true"}
          @canplay=${this._handleWebRtcDecoded}
          @loadeddata=${this._handleWebRtcDecoded}
          @playing=${this._handleWebRtcDecoded}
        ></video>
        ${
          connecting || resolvedSource
            ? html`<div
                class=${
                  sourceVisible
                    ? "source-indicator visible"
                    : "source-indicator"
                }
                role="status"
                aria-live="polite"
                aria-hidden=${sourceVisible ? "false" : "true"}
                aria-label=${
                  resolvedSource
                    ? `Live source: ${sourceLabel}`
                    : "Connecting to camera"
                }
              >
                ${
                  resolvedSource
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
          this.selected
            ? staticHtml`<${controlsTag}
                .visible=${this._visibility.visible}
                .fullscreenActive=${this._fullscreenActive}
                .fullscreenSupported=${this._fullscreenSupported()}
                .muted=${this.muted}
                .pictureInPictureActive=${this._pictureInPictureActive}
                .pictureInPictureSupported=${Boolean(
                  pictureInPictureMethod(this._activeVideo),
                )}
                @camera-control=${this._handleCameraControl}
              ></${controlsTag}>`
            : nothing
        }
        <${toastRegionTag} .notices=${this.notices}></${toastRegionTag}>
      </div>
    `;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    const webRtcVideo = this.webRtcVideo;
    if (webRtcVideo && webRtcVideo.srcObject !== (this.webRtcStream ?? null)) {
      setMediaElementMuted(
        webRtcVideo,
        this.selected === "webrtc" ? this.muted : true,
      );
      webRtcVideo.srcObject = this.webRtcStream ?? null;
      if (this.webRtcStream) this._emitMediaAttached(webRtcVideo);
    }
    const hlsHost = this.renderRoot.querySelector(".hls-host");
    if (hlsHost && this.hlsVideo && this.hlsVideo.parentElement !== hlsHost) {
      this.hlsVideo.setAttribute("aria-label", "Live camera");
      setMediaElementMuted(this.hlsVideo, this.muted);
      hlsHost.append(this.hlsVideo);
      this._emitMediaAttached(this.hlsVideo);
    }
    this._setActiveVideo(
      this.selected === "hls"
        ? this.hlsVideo
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
              fetchpriority="high"
              @error=${() => {
                this._posterFailed = true;
                this.requestUpdate();
              }}
            />`
          : nothing
      }`;
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
    this.dispatchEvent(
      new CustomEvent<HTMLVideoElement>("camera-webrtc-decoded", {
        bubbles: true,
        composed: true,
        detail: event.currentTarget as HTMLVideoElement,
      }),
    );
  };

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
    }
  };

  private _setActiveVideo(video: HTMLVideoElement | undefined): void {
    if (this._activeVideo === video) return;
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
    )
      return;
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

  private async _togglePictureInPicture(): Promise<void> {
    if (!this._activeVideo) return;
    try {
      await togglePictureInPicture(this._activeVideo);
    } catch (error) {
      this._requestToast(
        "error",
        error instanceof Error
          ? error.message
          : "Unable to change Picture-in-Picture mode.",
        "camera-picture-in-picture",
      );
    }
    this._syncControlState();
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
        if (document.exitFullscreen) await document.exitFullscreen();
        else await documentObject.webkitExitFullscreen?.();
      } else if (target?.requestFullscreen) {
        await target.requestFullscreen();
      } else if (target?.webkitRequestFullscreen) {
        await target.webkitRequestFullscreen();
      } else {
        const video = this._activeVideo as FullscreenVideo | undefined;
        const enter =
          video?.webkitEnterFullscreen ?? video?.webkitEnterFullScreen;
        if (!video || !enter)
          throw new Error("Fullscreen is not supported on this device.");
        enter.call(video);
      }
    } catch (error) {
      this._requestToast(
        "error",
        error instanceof Error
          ? error.message
          : "Unable to change fullscreen mode.",
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
