import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  CAMERA_CONTROLS_TAG,
  CAMERA_LIVE_PRESENTATION_TAG,
} from "../../../core/constants";
import {
  playMediaElement,
  setMediaElementMuted,
} from "../../../core/media-playback";
import type { MediaTransport } from "../../../core/media-session-manager";
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

const controlsTag = unsafeStatic(CAMERA_CONTROLS_TAG);

/** Renders one camera's live presentation and owns browser presentation APIs. */
export class CameraLivePresentation extends LitElement {
  public static properties = {
    available: { attribute: false, type: Boolean },
    controlError: { attribute: false },
    error: { attribute: false },
    hlsVideo: { attribute: false },
    muted: { attribute: false, type: Boolean },
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
  public controlError?: string;
  public error?: string;
  public hlsVideo?: HTMLVideoElement;
  public muted = true;
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
    const connecting = this.available && !this.error && !this.selected;
    const showSource = Boolean(
      this.selected &&
      this.transport &&
      (this._visibility.sourceVisible || this._visibility.visible),
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
          class="webrtc"
          autoplay
          playsinline
          .muted=${this.muted}
          aria-label="Live camera"
          ?hidden=${this.selected !== "webrtc"}
          @loadeddata=${this._handleWebRtcLoadedData}
        ></video>
        ${
          connecting || showSource
            ? html`<div
                class="source-indicator"
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
          this.selected
            ? staticHtml`<${controlsTag}
                .visible=${this._visibility.visible}
                .errorMessage=${this.controlError}
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
        ${this.error ? this._renderError(this.error) : nothing}
      </div>
    `;
  }

  protected updated(): void {
    const webRtcVideo = this.webRtcVideo;
    if (webRtcVideo && webRtcVideo.srcObject !== (this.webRtcStream ?? null)) {
      setMediaElementMuted(webRtcVideo, this.muted);
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

  private _renderError(error: string) {
    return html`<div class="status error" role="alert">
      <div class="status-content">
        <span>${error}</span>
        ${
          this.available
            ? html`<button
                type="button"
                @click=${() =>
                  this.dispatchEvent(
                    new CustomEvent("camera-retry", {
                      bubbles: true,
                      composed: true,
                    }),
                  )}
              >
                Retry
              </button>`
            : nothing
        }
      </div>
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

  private readonly _handleWebRtcLoadedData = (event: Event): void => {
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
      this.controlError = undefined;
    } catch (error) {
      this.controlError =
        error instanceof Error
          ? error.message
          : "Unable to change Picture-in-Picture mode.";
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
      this.controlError = undefined;
    } catch (error) {
      this.controlError =
        error instanceof Error
          ? error.message
          : "Unable to change fullscreen mode.";
    }
    this._syncControlState();
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
