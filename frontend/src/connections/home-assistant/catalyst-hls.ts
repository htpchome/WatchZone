import type { HomeAssistantApi } from "../../core/home-assistant";
import type { LiveStartupTiming } from "../../core/live-startup-timing";
import {
  playMediaElement,
  setMediaElementRuntimeMuted,
} from "../../core/media-playback";
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

async function requestSelectedPlayback(
  video: HTMLVideoElement,
  muted: boolean,
): Promise<void> {
  setMediaElementRuntimeMuted(video, muted);
  try {
    await playMediaElement(video);
  } catch (error) {
    if (muted || !isAutoplayDenied(error)) return;
    setMediaElementRuntimeMuted(video, true);
    try {
      await playMediaElement(video);
    } catch {
      // Connection readiness and transport failure remain independently owned.
    }
  }
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

  // Preserve the established Catalyst lifecycle while isolating it from every
  // ordinary HLS client: attach temporarily runtime-muted, retain an unmuted
  // default, then apply selected-camera intent on the same element.
  video.muted = true;
  options.onVideo?.(video);
  setMediaElementRuntimeMuted(video, options.initialMuted);

  let closed = false;
  let connected = false;
  let rejectPending: ((error: unknown) => void) | undefined;

  const close = (): void => {
    if (closed) return;
    closed = true;
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
      async () => {
        if (closed) return;
        timing.mark("first_frame_decoded");
        connected = true;
        window.clearTimeout(timeout);
        await requestSelectedPlayback(video, options.initialMuted);
        if (closed) return;
        resolve({ video, timing, transport: "hls_native", close });
      },
      { once: true },
    );
    video.addEventListener("error", () => fail(video.error), { once: true });
  });

  try {
    timing.mark("stream_url_requested");
    const streamRequest = api.callWS<StreamResponse>({
      type: "camera/stream",
      entity_id: entityId,
      format: "hls",
    });
    if (!options.initialMuted) {
      await requestSelectedPlayback(video, false);
    }
    const stream = await streamRequest;
    timing.mark("stream_url_received");
    if (signal.aborted) throw abortError();
    if (!video.canPlayType(HLS_CONTENT_TYPE)) {
      throw new Error("Catalyst does not support native HLS playback");
    }
    timing.mark("hls_native_path_selected");
    video.src = api.resolveUrl(stream.url);
    setMediaElementRuntimeMuted(video, options.initialMuted);
  } catch (error) {
    fail(error);
  }

  return ready;
}
