import type HlsType from "hls.js";
import { html, LitElement } from "lit";

import { detectClientProfile } from "../core/client-profile";
import {
  MEDIA_PLAYER_TAG,
  RECORDED_MEDIA_ERROR_EVENT,
} from "../core/constants";
import type { HomeAssistantApi } from "../core/home-assistant";
import {
  isMediaFullscreenActive,
  mediaFullscreenSupported,
  toggleMediaFullscreen,
} from "../core/fullscreen";
import { englishLocalize, type LocalizeFunction } from "../core/localization";
import { playMediaElement, setMediaElementMuted } from "../core/media-playback";
import {
  isPictureInPictureActive,
  pictureInPictureMethod,
  refreshNativePictureInPictureSuppression,
  suppressNativePictureInPicture,
  togglePictureInPicture,
} from "../core/picture-in-picture";
import type {
  RecordedMediaRequest,
  RecordedMediaSource,
} from "../core/recorded-media";
import { mediaOverlayControlButtonStyles } from "../styles/theme-tokens";
import { renderIcon } from "../ui/icons";
import { MediaZoomController } from "../ui/media-zoom.controller";
import { mediaPlayerStyles } from "./media-player.styles";

const HLS_CONTENT_TYPE = "application/vnd.apple.mpegurl";
const SOURCE_READY_TIMEOUT_MS = 12_000;
const CONTROLS_HIDE_DELAY_MS = 2500;

/** Ephemeral recorded-media playback engine. */
export class MediaPlayer extends LitElement {
  public static properties = {
    api: { attribute: false },
    localize: { attribute: false },
    request: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public localize: LocalizeFunction = englishLocalize;
  public request?: RecordedMediaRequest;

  private _fullscreenActive = false;
  private _controlsFocused = false;
  private _controlsHovered = false;
  private _controlsVisible = false;
  private _controlsHideTimer?: ReturnType<typeof setTimeout>;
  private _generation = 0;
  private _hls?: HlsType;
  private _muted = true;
  private _pictureInPictureActive = false;
  private _pointerFocusPending = false;
  private _pointerFocusResetTimer?: ReturnType<typeof setTimeout>;
  private _resizeObserver?: ResizeObserver;
  private readonly _zoom = new MediaZoomController(this);

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
    this._clearControlsHideTimer();
    this._clearPointerFocusReset();
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this.style.removeProperty("--wzc-camera-control-size");
    this._stopPlayback();
    super.disconnectedCallback();
  }

  protected render() {
    const video = this._video();
    const fullscreenSupported = mediaFullscreenSupported(
      this._viewport(),
      video,
    );
    const pictureInPictureSupported = Boolean(pictureInPictureMethod(video));
    return html`<div
      class="viewport"
      tabindex="0"
      aria-label=${this.localize("media_player.zoom_view", {
        percent: Math.round(this._zoom.scale * 100),
      })}
      @pointerenter=${this._handlePointerEnter}
      @pointerleave=${this._handlePointerLeave}
      @pointerdown=${this._handleViewportPointerDown}
      @pointermove=${this._handleViewportPointerMove}
      @pointerup=${this._handleViewportPointerUp}
      @pointercancel=${this._handleViewportPointerCancel}
      @focusin=${this._handleFocusIn}
      @focusout=${this._handleFocusOut}
      @wheel=${this._zoom.handleWheel}
      @keydown=${this._zoom.handleKeyDown}
    >
      <video
        class=${this._zoom.interacting ? "interacting" : ""}
        style=${`transform: ${this._zoom.transform}`}
        controls
        autoplay
        muted
        playsinline
        preload="auto"
        poster=${this.request?.posterUrl ?? ""}
        @loadedmetadata=${this._handleLoadedMetadata}
        @volumechange=${this._syncControlState}
        @enterpictureinpicture=${this._syncControlState}
        @leavepictureinpicture=${this._syncControlState}
        @webkitpresentationmodechanged=${this._syncControlState}
      ></video>
      <div
        class=${`controls media-overlay-control-group${
          this._controlsVisible ? " visible" : ""
        }`}
        role="group"
        aria-label=${this.localize("media_player.controls")}
        @pointerdown=${this._handleControlsPointerDown}
        @pointerup=${this._handleControlsPointerEnd}
        @pointercancel=${this._handleControlsPointerEnd}
        @keydown=${(event: Event) => event.stopPropagation()}
      >
        <button
          class="control-button media-overlay-control-button"
          type="button"
          data-control="picture_in_picture"
          title=${this.localize(
            this._pictureInPictureActive
              ? "media_player.exit_pip"
              : "media_player.enter_pip",
          )}
          aria-label=${this.localize(
            this._pictureInPictureActive
              ? "media_player.exit_pip"
              : "media_player.enter_pip",
          )}
          aria-pressed=${this._pictureInPictureActive ? "true" : "false"}
          ?disabled=${!pictureInPictureSupported}
          @pointerup=${this._releaseTouchFocus}
          @click=${this._togglePictureInPicture}
        >
          ${renderIcon("pipPopOut")}
        </button>
        <button
          class="control-button media-overlay-control-button"
          type="button"
          data-control="fullscreen"
          title=${this.localize(
            this._fullscreenActive
              ? "media_player.exit_fullscreen"
              : "media_player.enter_fullscreen",
          )}
          aria-label=${this.localize(
            this._fullscreenActive
              ? "media_player.exit_fullscreen"
              : "media_player.enter_fullscreen",
          )}
          aria-pressed=${this._fullscreenActive ? "true" : "false"}
          ?disabled=${!fullscreenSupported}
          @pointerup=${this._releaseTouchFocus}
          @click=${this._toggleFullscreen}
        >
          ${renderIcon(
            this._fullscreenActive ? "fullscreenExit" : "fullscreen",
          )}
        </button>
        <button
          class="control-button media-overlay-control-button"
          type="button"
          data-control="mute"
          title=${this.localize(
            this._muted ? "media_player.unmute" : "media_player.mute",
          )}
          aria-label=${this.localize(
            this._muted ? "media_player.unmute" : "media_player.mute",
          )}
          aria-pressed=${this._muted ? "false" : "true"}
          @pointerup=${this._releaseTouchFocus}
          @click=${this._toggleMute}
        >
          ${renderIcon(this._muted ? "volumeOff" : "volumeOn")}
        </button>
      </div>
    </div>`;
  }

  protected firstUpdated(): void {
    this._zoom.observe(this._viewport() ?? undefined);
    this._observeControlSize();
    void this._loadRequest();
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request")) this._zoom.configure(this.request?.id);
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request") && changed.get("request") !== undefined) {
      void this._loadRequest();
    }
    this._zoom.observe(this._viewport() ?? undefined);
    refreshNativePictureInPictureSuppression(this._video());
  }

  private async _loadRequest(): Promise<void> {
    const video = this.renderRoot.querySelector("video");
    const request = this.request;
    if (!video || !request) return;
    const generation = ++this._generation;
    this._clearSource(video);
    setMediaElementMuted(video, true);
    suppressNativePictureInPicture(video);
    this._syncControlState();

    for (const source of orderedSources(request)) {
      if (generation !== this._generation) return;
      try {
        await this._trySource(video, source, generation);
        if (generation !== this._generation) return;
        await playMediaElement(video);
        refreshNativePictureInPictureSuppression(video);
        return;
      } catch {
        if (generation !== this._generation) return;
        this._clearSource(video);
      }
    }
    if (generation === this._generation) {
      this._reportError();
    }
  }

  private async _trySource(
    video: HTMLVideoElement,
    source: RecordedMediaSource,
    generation: number,
  ): Promise<void> {
    const url = await this._resolveSourceUrl(source.url);
    if (generation !== this._generation) {
      throw new DOMException("Playback superseded", "AbortError");
    }
    if (source.transport === "file") {
      video.src = url;
      video.load();
      return waitForMediaReady(video, generation, () => this._generation);
    }
    if (video.canPlayType(source.content_type || HLS_CONTENT_TYPE)) {
      video.src = url;
      video.load();
      return waitForMediaReady(video, generation, () => this._generation);
    }
    if (detectClientProfile().isCatalyst) {
      throw new Error("Native HLS playback is unavailable");
    }
    const { default: Hls } = await import("hls.js/dist/hls.light.mjs");
    if (!Hls.isSupported() || generation !== this._generation) {
      throw new Error("HLS playback is unavailable");
    }
    const hls = new Hls();
    this._hls = hls;
    const ready = waitForMediaReady(video, generation, () => this._generation);
    hls.attachMedia(video);
    hls.loadSource(url);
    await new Promise<void>((resolve, reject) => {
      const handleStartupError = (
        _event: string,
        data: { readonly error?: Error; readonly fatal: boolean },
      ): void => {
        if (data.fatal) {
          hls.off(Hls.Events.ERROR, handleStartupError);
          reject(data.error ?? new Error("HLS playback failed"));
        }
      };
      hls.on(Hls.Events.ERROR, handleStartupError);
      void ready.then(
        () => {
          hls.off(Hls.Events.ERROR, handleStartupError);
          resolve();
        },
        (error: unknown) => {
          hls.off(Hls.Events.ERROR, handleStartupError);
          reject(error);
        },
      );
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal && this._hls === hls) this._reportError();
    });
  }

  private _stopPlayback(): void {
    this._generation += 1;
    const video = this.renderRoot.querySelector("video");
    if (video) this._clearSource(video);
  }

  private _video(): HTMLVideoElement | undefined {
    return (
      this.renderRoot.querySelector<HTMLVideoElement>("video") ?? undefined
    );
  }

  private _viewport(): HTMLElement | undefined {
    return this.renderRoot.querySelector<HTMLElement>(".viewport") ?? undefined;
  }

  private readonly _handleLoadedMetadata = (): void => {
    const video = this._video();
    this._zoom.setMediaDimensions(
      video?.videoWidth ?? 0,
      video?.videoHeight ?? 0,
    );
    refreshNativePictureInPictureSuppression(video);
    this._syncControlState();
  };

  private readonly _syncControlState = (): void => {
    const video = this._video();
    const muted = video?.muted ?? true;
    const fullscreenActive = isMediaFullscreenActive(video);
    const pictureInPictureActive = isPictureInPictureActive(video);
    if (
      muted === this._muted &&
      fullscreenActive === this._fullscreenActive &&
      pictureInPictureActive === this._pictureInPictureActive
    ) {
      return;
    }
    this._muted = muted;
    this._fullscreenActive = fullscreenActive;
    this._pictureInPictureActive = pictureInPictureActive;
    this.requestUpdate();
  };

  private readonly _toggleMute = (): void => {
    const video = this._video();
    if (!video) return;
    setMediaElementMuted(video, !video.muted);
    if (!video.muted) void playMediaElement(video);
    this._syncControlState();
  };

  private readonly _toggleFullscreen = async (): Promise<void> => {
    const video = this._video();
    const viewport = this._viewport();
    if (!mediaFullscreenSupported(viewport, video)) {
      this._reportControlError(
        this.localize("media_player.fullscreen_unsupported"),
      );
      return;
    }
    try {
      await toggleMediaFullscreen(viewport, video);
    } catch {
      this._reportControlError(this.localize("media_player.fullscreen_failed"));
    }
    this._syncControlState();
  };

  private readonly _togglePictureInPicture = async (): Promise<void> => {
    const video = this._video();
    if (!video) return;
    try {
      await togglePictureInPicture(video);
    } catch {
      this._reportControlError(this.localize("media_player.pip_failed"));
    }
    this._syncControlState();
  };

  private readonly _releaseTouchFocus = (event: PointerEvent): void => {
    if (event.pointerType === "touch") {
      (event.currentTarget as HTMLButtonElement).blur();
    }
  };

  private readonly _handlePointerEnter = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    this._controlsHovered = true;
    this._showControls();
  };

  private readonly _handlePointerLeave = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    this._controlsHovered = false;
    this._scheduleControlsHide();
  };

  private readonly _handleViewportPointerDown = (event: PointerEvent): void => {
    this._handleControlsInteraction(event);
    this._zoom.handlePointerDown(event);
  };

  private readonly _handleViewportPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") {
      this._controlsHovered = true;
      this._showControls();
    }
    this._zoom.handlePointerMove(event);
  };

  private readonly _handleViewportPointerUp = (event: PointerEvent): void => {
    this._endPointerInteraction();
    this._zoom.handlePointerUp(event);
  };

  private readonly _handleViewportPointerCancel = (
    event: PointerEvent,
  ): void => {
    this._endPointerInteraction();
    this._zoom.handlePointerCancel(event);
  };

  private readonly _handleControlsPointerDown = (event: PointerEvent): void => {
    event.stopPropagation();
    this._handleControlsInteraction(event);
  };

  private readonly _handleControlsPointerEnd = (event: PointerEvent): void => {
    event.stopPropagation();
    this._endPointerInteraction();
  };

  private readonly _handleFocusIn = (): void => {
    if (this._pointerFocusPending) return;
    this._controlsFocused = true;
    this._showControls();
  };

  private readonly _handleFocusOut = (event: FocusEvent): void => {
    const root = event.currentTarget as Node | null;
    if (root?.contains(event.relatedTarget as Node | null)) return;
    this._controlsFocused = false;
    this._scheduleControlsHide();
  };

  private _handleControlsInteraction(event: PointerEvent): void {
    if (event.pointerType === "touch") this._controlsHovered = false;
    this._controlsFocused = false;
    this._pointerFocusPending = true;
    this._clearPointerFocusReset();
    this._showControls();
    if (event.pointerType === "touch") this._scheduleControlsHide();
  }

  private _endPointerInteraction(): void {
    this._clearPointerFocusReset();
    this._pointerFocusResetTimer = setTimeout(() => {
      this._pointerFocusResetTimer = undefined;
      this._pointerFocusPending = false;
    });
  }

  private _showControls(): void {
    this._clearControlsHideTimer();
    if (this._controlsVisible) return;
    this._controlsVisible = true;
    this.requestUpdate();
  }

  private _scheduleControlsHide(): void {
    this._clearControlsHideTimer();
    if (this._controlsHovered || this._controlsFocused) return;
    this._controlsHideTimer = setTimeout(() => {
      this._controlsHideTimer = undefined;
      if (this._controlsHovered || this._controlsFocused) return;
      this._controlsVisible = false;
      this.requestUpdate();
    }, CONTROLS_HIDE_DELAY_MS);
  }

  private _clearControlsHideTimer(): void {
    if (this._controlsHideTimer === undefined) return;
    clearTimeout(this._controlsHideTimer);
    this._controlsHideTimer = undefined;
  }

  private _clearPointerFocusReset(): void {
    if (this._pointerFocusResetTimer === undefined) return;
    clearTimeout(this._pointerFocusResetTimer);
    this._pointerFocusResetTimer = undefined;
  }

  private _observeControlSize(): void {
    this._syncControlSize();
    if (typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(() => this._syncControlSize());
    this._resizeObserver.observe(this);
  }

  private _syncControlSize(): void {
    const { height, width } = this.getBoundingClientRect();
    if (height <= 0 || width <= 0) return;
    let size = "2.75rem";
    if (width <= 480) size = "2.35rem";
    if (height <= 360) size = "2.25rem";
    if (height <= 240) size = "1.875rem";
    this.style.setProperty("--wzc-camera-control-size", size);
  }

  private async _resolveSourceUrl(path: string): Promise<string> {
    const api = this.api;
    if (!api) return path;
    try {
      const signed = await api.callWS<{ readonly path?: string }>({
        type: "auth/sign_path",
        path,
        expires: 3600,
      });
      return api.resolveUrl(signed.path ?? path);
    } catch {
      return api.resolveUrl(path);
    }
  }

  private _clearSource(video: HTMLVideoElement): void {
    this._hls?.destroy();
    this._hls = undefined;
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  private _reportError(): void {
    this.dispatchEvent(
      new CustomEvent(RECORDED_MEDIA_ERROR_EVENT, {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _reportControlError(message: string): void {
    this.dispatchEvent(
      new CustomEvent(RECORDED_MEDIA_ERROR_EVENT, {
        bubbles: true,
        composed: true,
        detail: { message },
      }),
    );
  }

  static styles = [mediaOverlayControlButtonStyles, mediaPlayerStyles];
}

function orderedSources(request: RecordedMediaRequest): RecordedMediaSource[] {
  const sources = [...request.sources];
  if (detectClientProfile().isCatalyst) {
    return sources.filter(({ transport }) => transport === "hls");
  }
  return sources.sort((left, right) => {
    const leftPreferred = left.transport === request.preferredTransport;
    const rightPreferred = right.transport === request.preferredTransport;
    return Number(rightPreferred) - Number(leftPreferred);
  });
}

function waitForMediaReady(
  video: HTMLVideoElement,
  generation: number,
  currentGeneration: () => number,
): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timeout);
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("error", failed);
    };
    const ready = (): void => {
      cleanup();
      if (generation === currentGeneration()) resolve();
      else reject(new DOMException("Playback superseded", "AbortError"));
    };
    const failed = (): void => {
      cleanup();
      reject(video.error ?? new Error("Recorded media failed to load"));
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Recorded media timed out"));
    }, SOURCE_READY_TIMEOUT_MS);
    video.addEventListener("loadeddata", ready, { once: true });
    video.addEventListener("error", failed, { once: true });
  });
}

if (!customElements.get(MEDIA_PLAYER_TAG)) {
  customElements.define(MEDIA_PLAYER_TAG, MediaPlayer);
}

declare global {
  interface HTMLElementTagNameMap {
    [MEDIA_PLAYER_TAG]: MediaPlayer;
  }
}
