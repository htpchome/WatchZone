import type HlsType from "hls.js";
import { LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import { detectClientProfile } from "../../core/client-profile";
import {
  MEDIA_CONTROL_EVENT,
  MEDIA_CONTROLS_TAG,
  RECORDED_VIDEO_TRANSPORT_EVENT,
  RECORDED_VIDEO_TRANSPORT_HOLD_EVENT,
  RECORDED_VIDEO_TRANSPORT_TAG,
  RECORDED_VIDEO_PLAYER_TAG,
  RECORDED_MEDIA_ERROR_EVENT,
} from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import {
  isMediaFullscreenActive,
  mediaFullscreenSupported,
  toggleMediaFullscreen,
} from "../../core/fullscreen";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import {
  playMediaElement,
  setMediaElementMuted,
} from "../../core/media-playback";
import {
  isPictureInPictureActive,
  pictureInPictureMethod,
  refreshNativePictureInPictureSuppression,
  suppressNativePictureInPicture,
  togglePictureInPicture,
} from "../../core/picture-in-picture";
import type {
  RecordedMediaRequest,
  RecordedMediaSource,
} from "../../core/recorded-media";
import { MediaPresentationController } from "../media-presentation.controller";
import type {
  MediaControlDescriptor,
  MediaControlEventDetail,
} from "../media-controls-overlay";
import "../media-controls-overlay";
import { recordedVideoPlayerStyles } from "./recorded-video-player.styles";
import type {
  RecordedVideoTransportEventDetail,
  RecordedVideoTransportHoldDetail,
} from "./transport-controls";
import "./transport-controls";

const HLS_CONTENT_TYPE = "application/vnd.apple.mpegurl";
const SOURCE_READY_TIMEOUT_MS = 12_000;
const mediaControlsTag = unsafeStatic(MEDIA_CONTROLS_TAG);
const mediaControlEvent = unsafeStatic(MEDIA_CONTROL_EVENT);
const transportTag = unsafeStatic(RECORDED_VIDEO_TRANSPORT_TAG);
const transportEvent = unsafeStatic(RECORDED_VIDEO_TRANSPORT_EVENT);
const transportHoldEvent = unsafeStatic(RECORDED_VIDEO_TRANSPORT_HOLD_EVENT);
type RecordedVideoControlAction = "fullscreen" | "picture_in_picture";

/** Ephemeral recorded-media playback engine. */
export class RecordedVideoPlayer extends LitElement {
  public static properties = {
    api: { attribute: false },
    localize: { attribute: false },
    request: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public localize: LocalizeFunction = englishLocalize;
  public request?: RecordedMediaRequest;

  private _fullscreenActive = false;
  private _generation = 0;
  private _hls?: HlsType;
  private _currentTime = 0;
  private _duration = 0;
  private _muted = true;
  private _paused = true;
  private _pictureInPictureActive = false;
  private _transportHoldRelease?: () => void;
  private _volume = 1;
  private readonly _media = new MediaPresentationController(this);

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
    this._releaseTransportHold();
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
    const controls: readonly MediaControlDescriptor<RecordedVideoControlAction>[] =
      [
        {
          action: "picture_in_picture",
          active: this._pictureInPictureActive,
          disabled: !pictureInPictureSupported,
          icon: "pipPopOut",
          label: this.localize(
            this._pictureInPictureActive
              ? "media_player.exit_pip"
              : "media_player.enter_pip",
          ),
        },
        {
          action: "fullscreen",
          active: this._fullscreenActive,
          disabled: !fullscreenSupported,
          icon: this._fullscreenActive ? "fullscreenExit" : "fullscreen",
          label: this.localize(
            this._fullscreenActive
              ? "media_player.exit_fullscreen"
              : "media_player.enter_fullscreen",
          ),
        },
      ];
    return staticHtml`<div
      class="viewport"
      tabindex="0"
      aria-label=${this.localize("media_player.zoom_view", {
        percent: Math.round(this._media.zoom.scale * 100),
      })}
      @pointerenter=${this._media.overlay.handlePointerEnter}
      @pointerleave=${this._media.overlay.handlePointerLeave}
      @pointerdown=${this._media.handlePointerDown}
      @pointermove=${this._media.handlePointerMove}
      @pointerup=${this._media.handlePointerUp}
      @pointercancel=${this._media.handlePointerCancel}
      @wheel=${this._media.handleWheel}
      @keydown=${this._media.handleKeyDown}
      @focusin=${this._media.overlay.handleFocusIn}
      @focusout=${this._media.overlay.handleFocusOut}
    >
      <video
        class=${this._media.zoom.interacting ? "interacting" : ""}
        style=${`transform: ${this._media.zoom.transform}`}
        autoplay
        muted
        playsinline
        preload="auto"
        poster=${this.request?.posterUrl ?? ""}
        @loadedmetadata=${this._handleLoadedMetadata}
        @durationchange=${this._syncControlState}
        @timeupdate=${this._syncControlState}
        @play=${this._syncControlState}
        @pause=${this._syncControlState}
        @volumechange=${this._syncControlState}
        @enterpictureinpicture=${this._syncControlState}
        @leavepictureinpicture=${this._syncControlState}
        @webkitpresentationmodechanged=${this._syncControlState}
      ></video>
      <${mediaControlsTag}
        .controls=${controls}
        .label=${this.localize("media_player.controls")}
        .visible=${this._media.overlay.visible}
        .viewportEdge=${this._fullscreenActive}
        @${mediaControlEvent}=${this._handleControl}
      ></${mediaControlsTag}>
      <${transportTag}
        .currentTime=${this._currentTime}
        .duration=${this._duration}
        .localize=${this.localize}
        .muted=${this._muted}
        .paused=${this._paused}
        .visible=${this._media.overlay.visible}
        .viewportEdge=${this._fullscreenActive}
        .volume=${this._volume}
        @${transportEvent}=${this._handleTransport}
        @${transportHoldEvent}=${this._handleTransportHold}
      ></${transportTag}>
    </div>`;
  }

  protected firstUpdated(): void {
    this._media.observe(this._viewport() ?? undefined);
    void this._loadRequest();
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request")) this._media.configure(this.request?.id);
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request") && changed.get("request") !== undefined) {
      void this._loadRequest();
    }
    this._media.observe(this._viewport() ?? undefined);
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
        this._syncControlState();
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
    this._media.zoom.setMediaDimensions(
      video?.videoWidth ?? 0,
      video?.videoHeight ?? 0,
    );
    refreshNativePictureInPictureSuppression(video);
    this._syncControlState();
  };

  private readonly _syncControlState = (): void => {
    const video = this._video();
    const muted = video?.muted ?? true;
    const paused = video?.paused ?? true;
    const currentTime = finiteMediaValue(video?.currentTime);
    const duration = finiteMediaValue(video?.duration);
    const volume = finiteVolume(video?.volume);
    const fullscreenActive = isMediaFullscreenActive(video);
    const pictureInPictureActive = isPictureInPictureActive(video);
    if (
      muted === this._muted &&
      paused === this._paused &&
      currentTime === this._currentTime &&
      duration === this._duration &&
      volume === this._volume &&
      fullscreenActive === this._fullscreenActive &&
      pictureInPictureActive === this._pictureInPictureActive
    ) {
      return;
    }
    this._muted = muted;
    this._paused = paused;
    this._currentTime = currentTime;
    this._duration = duration;
    this._volume = volume;
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

  private readonly _togglePlayback = async (): Promise<void> => {
    const video = this._video();
    if (!video) return;
    if (video.paused) {
      try {
        await playMediaElement(video);
      } catch {
        this._reportError();
      }
    } else video.pause();
    this._syncControlState();
  };

  private _seek(value: number): void {
    const video = this._video();
    if (!video || !Number.isFinite(value)) return;
    video.currentTime = Math.max(
      0,
      Math.min(value, finiteMediaValue(video.duration)),
    );
    this._syncControlState();
  }

  private _setVolume(value: number): void {
    const video = this._video();
    if (!video || !Number.isFinite(value)) return;
    const volume = finiteVolume(value);
    setMediaElementMuted(video, volume === 0);
    video.volume = volume;
    this._syncControlState();
  }

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

  private readonly _handleControl = (
    event: CustomEvent<MediaControlEventDetail<RecordedVideoControlAction>>,
  ): void => {
    event.stopPropagation();
    if (event.detail.action === "fullscreen") {
      void this._toggleFullscreen();
    } else {
      void this._togglePictureInPicture();
    }
  };

  private readonly _handleTransport = (
    event: CustomEvent<RecordedVideoTransportEventDetail>,
  ): void => {
    event.stopPropagation();
    const { action, value } = event.detail;
    if (action === "toggle_play") void this._togglePlayback();
    else if (action === "toggle_mute") this._toggleMute();
    else if (action === "seek" && value !== undefined) this._seek(value);
    else if (action === "volume" && value !== undefined) this._setVolume(value);
  };

  private readonly _handleTransportHold = (
    event: CustomEvent<RecordedVideoTransportHoldDetail>,
  ): void => {
    event.stopPropagation();
    if (event.detail.active) {
      this._transportHoldRelease ??= this._media.overlay.hold();
    } else this._releaseTransportHold();
  };

  private _releaseTransportHold(): void {
    this._transportHoldRelease?.();
    this._transportHoldRelease = undefined;
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

  static styles = recordedVideoPlayerStyles;
}

function finiteMediaValue(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

function finiteVolume(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 1;
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

if (!customElements.get(RECORDED_VIDEO_PLAYER_TAG)) {
  customElements.define(RECORDED_VIDEO_PLAYER_TAG, RecordedVideoPlayer);
}

declare global {
  interface HTMLElementTagNameMap {
    [RECORDED_VIDEO_PLAYER_TAG]: RecordedVideoPlayer;
  }
}
