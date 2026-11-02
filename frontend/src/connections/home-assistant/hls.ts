import type HlsType from "hls.js";

import type { HomeAssistantApi } from "../../core/home-assistant";
import type { LiveStartupTiming } from "../../core/live-startup-timing";
import {
  playMediaElement,
  setMediaElementMuted,
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

function selectSingleVariant(manifest: string, manifestUrl: string): string {
  const lines = manifest.split(/\r?\n/);
  const variants: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("#EXT-X-STREAM-INF:")) {
      continue;
    }
    const variant = lines.slice(index + 1).find((line) => {
      const value = line.trim();
      return value.length > 0 && !value.startsWith("#");
    });
    if (variant) {
      variants.push(new URL(variant.trim(), manifestUrl).href);
    }
  }
  return variants.length === 1 ? variants[0] : manifestUrl;
}

export async function createHomeAssistantHlsConnection(
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
  timing: LiveStartupTiming,
  options: MediaConnectionOptions = { initialMuted: true },
): Promise<MediaConnection> {
  if (signal.aborted) {
    throw abortError();
  }

  const video = document.createElement("video");
  video.autoplay = false;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.preload = "auto";
  setMediaElementMuted(video, options.initialMuted);
  options.onVideo?.(video);

  // Prime the actual selected element before its source exists. WebKit makes
  // its first audible-playback decision at this boundary; replacing the
  // element or unmuting only after loadeddata loses that opportunity.
  if (!options.initialMuted) {
    void Promise.resolve()
      .then(() => (video.muted ? undefined : playMediaElement(video)))
      .catch(() => undefined);
  }

  let closed = false;
  let connected = false;
  let hls: HlsType | undefined;
  let transport: "hls_mse" | "hls_native" = "hls_native";
  let rejectPending: ((error: unknown) => void) | undefined;

  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    signal.removeEventListener("abort", handleAbort);
    hls?.destroy();
    hls = undefined;
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  };

  const fail = (error: unknown): void => {
    const normalized =
      error instanceof Error ? error : new Error("Home Assistant HLS failed");
    if (connected) {
      onFailure(normalized);
    } else {
      rejectPending?.(normalized);
    }
  };

  const handleAbort = (): void => {
    if (connected) {
      close();
    } else {
      rejectPending?.(abortError());
    }
  };
  signal.addEventListener("abort", handleAbort, { once: true });

  const ready = new Promise<MediaConnection>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      close();
      reject(
        new Error("Timed out connecting to the Home Assistant HLS stream"),
      );
    }, CONNECT_TIMEOUT_MS);

    rejectPending = (error) => {
      if (connected || closed) {
        return;
      }
      window.clearTimeout(timeout);
      close();
      reject(error instanceof Error ? error : new Error("Unable to start HLS"));
    };

    video.addEventListener(
      "loadeddata",
      () => {
        if (closed) {
          return;
        }
        timing.mark("first_frame_decoded");
        connected = true;
        window.clearTimeout(timeout);
        void playMediaElement(video).catch(() => undefined);
        resolve({ video, timing, transport, close });
      },
      { once: true },
    );
    video.addEventListener("error", () => fail(video.error), { once: true });
  });

  try {
    timing.mark("stream_url_requested");
    const stream = await api.callWS<StreamResponse>({
      type: "camera/stream",
      entity_id: entityId,
      format: "hls",
    });
    timing.mark("stream_url_received");
    const streamUrl = api.resolveUrl(stream.url);
    if (signal.aborted) {
      throw abortError();
    }

    const manifestPromise = fetch(streamUrl, { signal }).then(
      async (response) => {
        if (!response.ok) {
          throw new Error(`HLS manifest request failed (${response.status})`);
        }
        const manifest = await response.text();
        timing.mark("hls_manifest_loaded");
        return selectSingleVariant(manifest, streamUrl);
      },
    );
    const hlsModulePromise = import("hls.js/dist/hls.light.mjs").then(
      (module) => {
        timing.mark("hls_engine_loaded");
        return module;
      },
    );
    const [{ default: Hls }, playlistUrl] = await Promise.all([
      hlsModulePromise,
      manifestPromise,
    ]);

    if (Hls.isSupported()) {
      transport = "hls_mse";
      timing.mark("hls_mse_path_selected");
      if (signal.aborted) {
        throw abortError();
      }
      const player = new Hls({
        backBufferLength: 30,
        lowLatencyMode: true,
        maxLiveSyncPlaybackRate: 2,
      });
      hls = player;
      player.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          fail(data.error ?? new Error(`HLS ${data.type} error`));
        }
      });
      player.loadSource(playlistUrl);
      player.attachMedia(video);
    } else if (video.canPlayType(HLS_CONTENT_TYPE)) {
      timing.mark("hls_native_path_selected");
      video.src = playlistUrl;
      void playMediaElement(video).catch(() => undefined);
    } else {
      throw new Error("This browser does not support HLS playback");
    }
  } catch (error) {
    fail(error);
  }

  return ready;
}
