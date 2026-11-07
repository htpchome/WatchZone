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
import { hlsLiveEdgePolicy, monitorHlsLiveEdge } from "./hls-live-edge";

export type HlsStreamUrlResolver = (
  api: HomeAssistantApi,
  entityId: string,
) => Promise<string>;

const CONNECT_TIMEOUT_MS = 15_000;
const HLS_CONTENT_TYPE = "application/vnd.apple.mpegurl";
const HA_MASTER_PLAYLIST_SUFFIX = "/master_playlist.m3u8";
const HA_MEDIA_PLAYLIST_SUFFIX = "/playlist.m3u8";

interface PlaylistRequest {
  readonly requestUrl: string;
  readonly standardUrl: string;
}

function abortError(): DOMException {
  return new DOMException("Connection cancelled", "AbortError");
}

function homeAssistantPlaylistRequest(
  streamUrl: string,
  lowLatency: boolean,
): PlaylistRequest {
  const url = new URL(streamUrl);
  if (!url.pathname.endsWith(HA_MASTER_PLAYLIST_SUFFIX)) {
    return { requestUrl: streamUrl, standardUrl: streamUrl };
  }
  url.pathname = `${url.pathname.slice(0, -HA_MASTER_PLAYLIST_SUFFIX.length)}${HA_MEDIA_PLAYLIST_SUFFIX}`;
  const standardUrl = url.href;
  return {
    requestUrl: lowLatency
      ? `${standardUrl}${url.search ? "&" : "?"}_HLS_msn=0&_HLS_part=0`
      : standardUrl,
    standardUrl,
  };
}

function isLowLatencyManifest(manifest: string): boolean {
  return (
    manifest.includes("#EXT-X-PART-INF:") &&
    manifest.includes("CAN-BLOCK-RELOAD=YES")
  );
}

async function fetchPlaylist(
  request: PlaylistRequest,
  signal: AbortSignal,
): Promise<{ readonly manifest: string; readonly url: string }> {
  let url = request.requestUrl;
  let response = await fetch(url, { signal });
  if (!response.ok && request.requestUrl !== request.standardUrl) {
    url = request.standardUrl;
    response = await fetch(url, { signal });
  }
  if (!response.ok) {
    throw new Error(`HLS manifest request failed (${response.status})`);
  }
  return { manifest: await response.text(), url };
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

export async function createHlsConnection(
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
  timing: LiveStartupTiming,
  options: MediaConnectionOptions = { initialMuted: true },
  resolveStreamUrl: HlsStreamUrlResolver,
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
  let stopLiveEdgeMonitor: (() => void) | undefined;
  let transport: "hls_mse" | "hls_native" = "hls_native";
  let rejectPending: ((error: unknown) => void) | undefined;
  let frameRequest: number | undefined;

  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    signal.removeEventListener("abort", handleAbort);
    stopLiveEdgeMonitor?.();
    stopLiveEdgeMonitor = undefined;
    if (frameRequest !== undefined) {
      video.cancelVideoFrameCallback?.(frameRequest);
      frameRequest = undefined;
    }
    hls?.destroy();
    hls = undefined;
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  };

  const fail = (error: unknown): void => {
    const normalized =
      error instanceof Error ? error : new Error("HLS playback failed");
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
        new Error("Timed out connecting to the HLS stream"),
      );
    }, CONNECT_TIMEOUT_MS);

    rejectPending = (error) => {
      if (connected || closed) {
        return;
      }
      window.clearTimeout(timeout);
      close();
      reject(
        error instanceof Error || error instanceof DOMException
          ? error
          : new Error("Unable to start HLS"),
      );
    };

    const resolveReady = (): void => {
      if (closed || connected) return;
      frameRequest = undefined;
      timing.mark("first_frame_decoded");
      connected = true;
      window.clearTimeout(timeout);
      void playMediaElement(video).catch(() => undefined);
      resolve({ video, timing, transport, close });
    };
    video.addEventListener(
      "loadeddata",
      () => {
        if (closed || connected) return;
        if (
          transport !== "hls_native" &&
          typeof video.requestVideoFrameCallback === "function"
        ) {
          frameRequest ??= video.requestVideoFrameCallback(resolveReady);
        } else {
          resolveReady();
        }
      },
      { once: true },
    );
    video.addEventListener("error", () => fail(video.error), { once: true });
  });

  const setup = (async (): Promise<void> => {
    try {
      timing.mark("stream_url_requested");
      const resolvedStreamUrl = await resolveStreamUrl(api, entityId);
      timing.mark("stream_url_received");
      const streamUrl = api.resolveUrl(resolvedStreamUrl);
      if (signal.aborted || closed) return;

      const lowLatencyRequested = options.lowLatencyHls !== false;
      const playlistRequest = homeAssistantPlaylistRequest(
        streamUrl,
        lowLatencyRequested,
      );

      const manifestPromise = fetchPlaylist(playlistRequest, signal).then(
        ({ manifest, url }) => {
          timing.mark("hls_manifest_loaded");
          const lowLatency =
            lowLatencyRequested &&
            url === playlistRequest.requestUrl &&
            isLowLatencyManifest(manifest);
          timing.setHlsMode(lowLatency ? "low_latency" : "standard");
          return {
            manifest,
            lowLatency,
            playlistUrl: lowLatency
              ? selectSingleVariant(manifest, url)
              : selectSingleVariant(manifest, playlistRequest.standardUrl),
          };
        },
      );
      const hlsModulePromise = import("hls.js/dist/hls.light.mjs").then(
        (module) => {
          timing.mark("hls_engine_loaded");
          return module;
        },
      );
      const [{ default: Hls }, manifest] = await Promise.all([
        hlsModulePromise,
        manifestPromise,
      ]);
      if (signal.aborted || closed) return;

      if (Hls.isSupported()) {
        transport = "hls_mse";
        timing.mark("hls_mse_path_selected");
        const liveEdge = hlsLiveEdgePolicy(
          manifest.manifest,
          manifest.lowLatency,
        );
        const player = new Hls({
          backBufferLength: 30,
          ...liveEdge.hlsJsConfig,
          lowLatencyMode: manifest.lowLatency,
          maxLiveSyncPlaybackRate: 2,
        });
        hls = player;
        if (!manifest.lowLatency) {
          stopLiveEdgeMonitor = monitorHlsLiveEdge(video, liveEdge);
        }
        player.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            fail(data.error ?? new Error(`HLS ${data.type} error`));
          }
        });
        player.loadSource(manifest.playlistUrl);
        player.attachMedia(video);
      } else if (video.canPlayType(HLS_CONTENT_TYPE)) {
        timing.mark("hls_native_path_selected");
        video.src = manifest.playlistUrl;
        void playMediaElement(video).catch(() => undefined);
      } else {
        throw new Error("This browser does not support HLS playback");
      }
    } catch (error) {
      fail(error);
    }
  })();

  // Observe readiness immediately while source setup is still pending. This
  // prevents an intentional HLS-loser abort from becoming a transient
  // unhandled rejection before the connection factory returns to its manager.
  const [connection] = await Promise.all([ready, setup]);
  return connection;
}
