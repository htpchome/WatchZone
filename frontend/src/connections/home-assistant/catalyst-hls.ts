import type { HomeAssistantApi } from "../../core/home-assistant";
import type { LiveStartupTiming } from "../../core/live-startup-timing";
import type {
  MediaConnection,
  MediaConnectionOptions,
} from "../../core/media-session-manager";

interface StreamResponse {
  readonly url: string;
}

const CONNECT_TIMEOUT_MS = 15_000;
const HLS_CONTENT_TYPE = "application/vnd.apple.mpegurl";

function abortError(): DOMException {
  return new DOMException("Connection cancelled", "AbortError");
}

function isAutoplayDenied(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotAllowedError"
  );
}

class CatalystSelectedPlayback {
  private readonly _onLoaded = (): void => this._apply();

  public constructor(
    private readonly _video: HTMLVideoElement,
    private readonly _startsUnmuted: boolean,
    private readonly _isCurrent: () => boolean,
  ) {
    catalystPlaybackByVideo.set(this._video, this);
  }

  public start(): void {
    if (!this._startsUnmuted) return;
    this._video.addEventListener("loadeddata", this._onLoaded, { once: true });
    this._apply();
  }

  public dispose(): void {
    this._video.removeEventListener("loadeddata", this._onLoaded);
    catalystPlaybackByVideo.delete(this._video);
  }

  public async recoverAudibleAutoplay(): Promise<boolean> {
    if (!this._isCurrent()) return false;
    this._video.muted = true;
    try {
      await this._video.play();
    } catch {
      return false;
    }

    if (!this._isCurrent()) return false;
    this._video.muted = false;
    this._video.volume = 1;
    try {
      await this._video.play();
      return true;
    } catch {
      this._video.muted = true;
      try {
        await this._video.play();
      } catch {
        // Connection readiness and transport failure remain independent.
      }
      return false;
    }
  }

  private _apply(): void {
    if (!this._startsUnmuted || !this._isCurrent() || document.hidden) return;
    this._video.muted = false;
    this._video.volume = 1;
    void this._requestPlayback();
  }

  private async _requestPlayback(): Promise<void> {
    await Promise.resolve();
    if (!this._isCurrent() || this._video.muted || document.hidden) return;
    try {
      await this._video.play();
    } catch (error) {
      if (!isAutoplayDenied(error) || !this._isCurrent() || this._video.muted) {
        return;
      }
      this._video.muted = true;
      try {
        await this._video.play();
      } catch {
        // Native media readiness and transport failure remain independent.
      }
    }
  }
}

const catalystPlaybackByVideo = new WeakMap<
  HTMLVideoElement,
  CatalystSelectedPlayback
>();

export function recoverCatalystAudibleAutoplay(
  video: HTMLVideoElement,
): Promise<boolean> {
  return (
    catalystPlaybackByVideo.get(video)?.recoverAudibleAutoplay() ??
    Promise.resolve(false)
  );
}

/** Catalyst-only native HLS lifecycle. Ordinary HLS must not import this file. */
export async function createHomeAssistantCatalystHlsConnection(
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
  timing: LiveStartupTiming,
  options: MediaConnectionOptions = { initialMuted: true },
): Promise<MediaConnection> {
  if (signal.aborted) throw abortError();

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.preload = "auto";

  video.muted = true;
  options.onVideo?.(video);

  let closed = false;
  let connected = false;
  let rejectPending: ((error: unknown) => void) | undefined;
  const selectedPlayback = new CatalystSelectedPlayback(
    video,
    !options.initialMuted,
    () => !closed && !signal.aborted,
  );
  selectedPlayback.start();

  const close = (): void => {
    if (closed) return;
    closed = true;
    selectedPlayback.dispose();
    signal.removeEventListener("abort", handleAbort);
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  };
  const fail = (error: unknown): void => {
    const normalized =
      error instanceof Error
        ? error
        : new Error("Home Assistant Catalyst HLS failed");
    if (connected) onFailure(normalized);
    else rejectPending?.(normalized);
  };
  const handleAbort = (): void => {
    if (connected) close();
    else rejectPending?.(abortError());
  };
  signal.addEventListener("abort", handleAbort, { once: true });

  const ready = new Promise<MediaConnection>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      close();
      reject(new Error("Timed out connecting to Catalyst native HLS"));
    }, CONNECT_TIMEOUT_MS);
    rejectPending = (error) => {
      if (connected || closed) return;
      window.clearTimeout(timeout);
      close();
      reject(error instanceof Error ? error : new Error("Unable to start HLS"));
    };
    video.addEventListener(
      "loadeddata",
      () => {
        if (closed) return;
        timing.mark("first_frame_decoded");
        connected = true;
        window.clearTimeout(timeout);
        resolve({ video, timing, transport: "hls_native", close });
      },
      { once: true },
    );
    video.addEventListener("error", () => fail(video.error), { once: true });
  });

  try {
    timing.mark("stream_url_requested");
    await Promise.resolve();
    const stream = await api.callWS<StreamResponse>({
      type: "camera/stream",
      entity_id: entityId,
      format: "hls",
    });
    timing.mark("stream_url_received");
    if (signal.aborted) throw abortError();
    if (!video.canPlayType(HLS_CONTENT_TYPE)) {
      throw new Error("Catalyst does not support native HLS playback");
    }
    timing.mark("hls_native_path_selected");
    video.src = api.resolveUrl(stream.url);
  } catch (error) {
    fail(error);
  }

  return ready;
}
