import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  CAMERA_CONTROLS_TAG,
  CAMERA_LIVE_PRESENTATION_TAG,
  TOAST_TAG,
} from "../../../core/constants";
import { TimedVisibilityController } from "../../../ui/timed-visibility.controller";
import type { ToastElement } from "../../../ui/toast";
import "../../../ui/toast";
import { CAMERA_OVERLAY_HIDE_DELAY_MS } from "./constants";
import type { CameraControlEventDetail } from "./controls-overlay";
import "./controls-overlay";
import { CameraControlsVisibilityController } from "./controls-visibility.controller";
import { FullscreenLifecycleController } from "./fullscreen-lifecycle.controller";
import { cameraLivePresentationStyles } from "./presentation.styles";
import {
  renderMediaPresentation,
  type PresentedSource,
  type PresentedTransport,
} from "./media-presentation";
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

const cameraControlsTag = unsafeStatic(CAMERA_CONTROLS_TAG);
const toastTag = unsafeStatic(TOAST_TAG);

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

/** Renders camera media state and emits typed presentation intents. */
export class CameraLivePresentation extends LitElement {
  public static properties = {
    autoplayWarning: { attribute: false, type: Boolean },
    available: { attribute: false, type: Boolean },
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

  public autoplayWarning = false;
  public available = false;
  public error?: string;
  public hlsVideo?: HTMLVideoElement;
  public muted = true;
  public posterUrl?: string;
  public selected?: PresentedSource;
  public sessionRevision = 0;
  public transport?: PresentedTransport;
  public webRtcStream?: MediaStream;

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
      resumePlayback: (video) => this._emitMediaAttached(video),
    },
  );

  public get webRtcVideo(): HTMLVideoElement | undefined {
    return (
      this.shadowRoot?.querySelector<HTMLVideoElement>("video.webrtc") ??
      undefined
    );
  }

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("fullscreenchange", this._handleFullscreenChange);
    document.addEventListener(
      "webkitfullscreenchange",
      this._handleFullscreenChange,
    );
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
    this._setActiveVideo(undefined);
    this._sourceIntroduction.hide();
    super.disconnectedCallback();
  }

  protected render() {
    const connecting = this.available && !this.error && !this.selected;
    const showSource = Boolean(
      this.selected &&
      this.transport &&
      (this._sourceIntroduction.visible || this._controlsVisibility.visible),
    );
    return staticHtml`
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
        ${this._renderFallback(this.selected)}
        ${renderMediaPresentation({
          muted: this.muted,
          onWebRtcLoadedData: this._handleWebRtcLoadedData,
          selected: this.selected,
        })}
        ${
          connecting || showSource
            ? this._renderSourceIndicator(showSource, this.transport)
            : nothing
        }
        ${this.selected ? this._renderControls() : nothing}
        <${toastTag} class="camera-toast"></${toastTag}>
        ${this.error ? this._renderError(this.error) : nothing}
      </div>
    `;
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("posterUrl")) this._posterFailed = false;
    if (changed.has("transport")) {
      if (this.transport) this._sourceIntroduction.revealFor();
      else this._sourceIntroduction.hide();
    }
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("autoplayWarning")) {
      if (this.autoplayWarning) {
        this._showToast(
          "The browser blocked unmuted playback. Tap the audio button to retry.",
          "warning",
        );
      } else {
        this._dismissToast();
      }
    }
    const webRtcVideo = this.webRtcVideo;
    if (webRtcVideo && webRtcVideo.srcObject !== (this.webRtcStream ?? null)) {
      webRtcVideo.srcObject = this.webRtcStream ?? null;
      if (this.webRtcStream) this._emitMediaAttached(webRtcVideo);
    }
    const hlsHost = this.renderRoot.querySelector(".hls-host");
    if (hlsHost && this.hlsVideo && this.hlsVideo.parentElement !== hlsHost) {
      this.hlsVideo.setAttribute("aria-label", "Live camera");
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

  private _renderFallback(selected: "hls" | "webrtc" | undefined) {
    return !selected
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
            this.posterUrl && !this._posterFailed
              ? html`<img
                  class="fallback-image poster"
                  src=${this.posterUrl}
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  fetchpriority="high"
                  @error=${this._handlePosterError}
                />`
              : nothing
          }`
      : nothing;
  }

  private _renderSourceIndicator(
    showSource: boolean,
    transport: PresentedTransport | undefined,
  ) {
    const sourceLabel =
      transport === "webrtc"
        ? "WebRTC"
        : transport === "hls_native"
          ? "HLS · native"
          : transport === "hls_mse"
            ? "HLS · HLS.js"
            : "HLS";
    return html`<div
      class="source-indicator ${
        this._controlsVisibility.visible ? "controls-visible" : ""
      }"
      role="status"
      aria-live="polite"
      aria-label=${
        showSource ? `Live source: ${sourceLabel}` : "Connecting to camera"
      }
    >
      ${
        showSource
          ? sourceLabel
          : html`<span class="connection-spinner" aria-hidden="true"></span>
              <span>Connecting…</span>`
      }
    </div>`;
  }

  private _renderControls() {
    return staticHtml`<${cameraControlsTag}
      class="camera-controls"
      .visible=${this._controlsVisibility.visible}
      .fullscreenActive=${this._fullscreenActive}
      .fullscreenSupported=${this._fullscreenSupported()}
      .muted=${this.muted}
      .pictureInPictureActive=${this._pictureInPictureActive}
      .pictureInPictureSupported=${Boolean(
        pictureInPictureMethod(this._activeVideo),
      )}
      @camera-control=${this._handleCameraControl}
    ></${cameraControlsTag}>`;
  }

  private _renderError(error: string) {
    return html`<div class="status error" role="alert">
      <div class="status-content">
        <span>${error}</span>
        ${
          this.available
            ? html`<button type="button" @click=${this._retry}>Retry</button>`
            : nothing
        }
      </div>
    </div>`;
  }

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

  private readonly _handlePosterError = (): void => {
    this._posterFailed = true;
    this.requestUpdate();
  };

  private readonly _handleWebRtcLoadedData = (event: Event): void => {
    this.dispatchEvent(
      new CustomEvent<HTMLVideoElement>("camera-webrtc-decoded", {
        bubbles: true,
        composed: true,
        detail: event.currentTarget as HTMLVideoElement,
      }),
    );
  };

  private readonly _retry = (): void => {
    this._posterFailed = false;
    this.dispatchEvent(
      new CustomEvent("camera-retry", { bubbles: true, composed: true }),
    );
  };

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

  private readonly _handleCameraControl = (
    event: CustomEvent<CameraControlEventDetail>,
  ): void => {
    event.stopPropagation();
    this._dismissToast();
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

  private _emitMediaAttached(video: HTMLVideoElement): void {
    this.dispatchEvent(
      new CustomEvent<CameraMediaAttachedDetail>("camera-media-attached", {
        bubbles: true,
        composed: true,
        detail: { video },
      }),
    );
  }

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
        if (document.exitFullscreen) await document.exitFullscreen();
        else await documentObject.webkitExitFullscreen?.();
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
        ?.querySelector<ToastElement>(TOAST_TAG)
        ?.show(message, { category });
    };
    show();
    if (!this.shadowRoot?.querySelector(TOAST_TAG)) {
      void this.updateComplete.then(show);
    }
  }

  private _dismissToast(): void {
    this.shadowRoot?.querySelector<ToastElement>(TOAST_TAG)?.dismiss();
  }

  static styles = cameraLivePresentationStyles;
}

if (!customElements.get(CAMERA_LIVE_PRESENTATION_TAG)) {
  customElements.define(CAMERA_LIVE_PRESENTATION_TAG, CameraLivePresentation);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_LIVE_PRESENTATION_TAG]: CameraLivePresentation;
  }
}
