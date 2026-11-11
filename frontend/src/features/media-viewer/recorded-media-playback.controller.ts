import type HlsType from "hls.js";

import { detectClientProfile } from "../../core/client-profile";
import type { HomeAssistantApi } from "../../core/home-assistant";
import {
  playMediaElement,
  setMediaElementMuted,
} from "../../core/media-playback";
import {
  refreshNativePictureInPictureSuppression,
  suppressNativePictureInPicture,
} from "../../core/picture-in-picture";
import type {
  RecordedMediaRequest,
  RecordedMediaSource,
} from "../../core/recorded-media";

const HLS_CONTENT_TYPE = "application/vnd.apple.mpegurl";
const SOURCE_READY_TIMEOUT_MS = 12_000;

/** Owns recorded-source selection, startup, fallback, and complete cleanup. */
export class RecordedMediaPlaybackController {
  private _generation = 0;
  private _hls?: HlsType;

  public constructor(
    private readonly _api: () => HomeAssistantApi | undefined,
    private readonly _onError: () => void,
    private readonly _onReady: () => void,
  ) {}

  public async load(
    video: HTMLVideoElement,
    request: RecordedMediaRequest,
  ): Promise<void> {
    const generation = ++this._generation;
    this._clearSource(video);
    setMediaElementMuted(video, true);
    suppressNativePictureInPicture(video);

    for (const source of orderedSources(request)) {
      if (generation !== this._generation) return;
      try {
        await this._trySource(video, source, generation);
        if (generation !== this._generation) return;
        await playMediaElement(video);
        refreshNativePictureInPictureSuppression(video);
        this._onReady();
        return;
      } catch {
        if (generation !== this._generation) return;
        this._clearSource(video);
      }
    }
    if (generation === this._generation) this._onError();
  }

  public stop(video?: HTMLVideoElement): void {
    this._generation += 1;
    if (video) this._clearSource(video);
    else this._destroyHls();
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
    if (
      source.transport === "file" ||
      video.canPlayType(source.content_type || HLS_CONTENT_TYPE)
    ) {
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
      const startupError = (
        _event: string,
        data: { readonly error?: Error; readonly fatal: boolean },
      ): void => {
        if (!data.fatal) return;
        hls.off(Hls.Events.ERROR, startupError);
        reject(data.error ?? new Error("HLS playback failed"));
      };
      hls.on(Hls.Events.ERROR, startupError);
      void ready.then(
        () => {
          hls.off(Hls.Events.ERROR, startupError);
          resolve();
        },
        (error: unknown) => {
          hls.off(Hls.Events.ERROR, startupError);
          reject(error);
        },
      );
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal && this._hls === hls) this._onError();
    });
  }

  private async _resolveSourceUrl(path: string): Promise<string> {
    const api = this._api();
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
    this._destroyHls();
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  private _destroyHls(): void {
    this._hls?.destroy();
    this._hls = undefined;
  }
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
