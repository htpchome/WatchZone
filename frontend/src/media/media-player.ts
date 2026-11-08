import type HlsType from "hls.js";
import { html, LitElement } from "lit";

import { detectClientProfile } from "../core/client-profile";
import {
  MEDIA_PLAYER_TAG,
  RECORDED_MEDIA_ERROR_EVENT,
} from "../core/constants";
import type { HomeAssistantApi } from "../core/home-assistant";
import { playMediaElement, setMediaElementMuted } from "../core/media-playback";
import type {
  RecordedMediaRequest,
  RecordedMediaSource,
} from "../core/recorded-media";
import { mediaPlayerStyles } from "./media-player.styles";

const HLS_CONTENT_TYPE = "application/vnd.apple.mpegurl";
const SOURCE_READY_TIMEOUT_MS = 12_000;

/** Ephemeral recorded-media playback engine. */
export class MediaPlayer extends LitElement {
  public static properties = {
    api: { attribute: false },
    request: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public request?: RecordedMediaRequest;

  private _generation = 0;
  private _hls?: HlsType;

  public disconnectedCallback(): void {
    this._stopPlayback();
    super.disconnectedCallback();
  }

  protected render() {
    return html`<video
      controls
      autoplay
      muted
      playsinline
      preload="auto"
      poster=${this.request?.posterUrl ?? ""}
    ></video>`;
  }

  protected firstUpdated(): void {
    void this._loadRequest();
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request") && changed.get("request") !== undefined) {
      void this._loadRequest();
    }
  }

  private async _loadRequest(): Promise<void> {
    const video = this.renderRoot.querySelector("video");
    const request = this.request;
    if (!video || !request) return;
    const generation = ++this._generation;
    this._clearSource(video);
    setMediaElementMuted(video, true);

    for (const source of orderedSources(request)) {
      if (generation !== this._generation) return;
      try {
        await this._trySource(video, source, generation);
        if (generation !== this._generation) return;
        await playMediaElement(video);
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
    const url = this.api?.resolveUrl(source.url) ?? source.url;
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

  static styles = mediaPlayerStyles;
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
