import type { FrigateGo2RtcLiveSourceDescriptor } from "../../../api/live-source";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import type { LiveStartupTiming } from "../../../core/live-startup-timing";
import {
  playMediaElement,
  setMediaElementMuted,
} from "../../../core/media-playback";
import type {
  MediaConnection,
  MediaConnectionOptions,
} from "../../../core/media-session-manager";

const CONNECT_TIMEOUT_MS = 15_000;
const MAX_PENDING_MEDIA_BYTES = 16 * 1024 * 1024;
const SIGNED_PATH_SECONDS = 60;
const CODECS =
  "avc1.640029,avc1.64002A,avc1.640033,hvc1.1.6.L153.B0,mp4a.40.2,mp4a.40.5,flac,opus";

function websocketUrl(api: HomeAssistantApi, path: string): string {
  const url = new URL(api.resolveUrl(path), window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

/** Authenticated fragmented-MP4 playback through Frigate's integration proxy. */
export async function createFrigateMseConnection(
  api: HomeAssistantApi,
  _entityId: string,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
  timing: LiveStartupTiming,
  options: MediaConnectionOptions,
  source: FrigateGo2RtcLiveSourceDescriptor,
): Promise<MediaConnection> {
  if (!("MediaSource" in window)) throw new Error("MSE is unavailable");
  const proxyPath = `/api/frigate/${encodeURIComponent(
    source.frigate_instance_id,
  )}/go2rtc/ws/api/ws?src=${encodeURIComponent(source.stream_name)}`;
  const signed = await api.callWS<{ readonly path: string }>({
    type: "auth/sign_path",
    path: proxyPath,
    expires: SIGNED_PATH_SECONDS,
  });
  if (signal.aborted)
    throw new DOMException("Connection cancelled", "AbortError");

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  setMediaElementMuted(video, options.initialMuted);
  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  video.src = objectUrl;
  options.onVideo?.(video);

  const socket = new WebSocket(websocketUrl(api, signed.path));
  socket.binaryType = "arraybuffer";
  let sourceBuffer: SourceBuffer | undefined;
  let closed = false;
  let connected = false;
  let failureReported = false;
  let mediaOpen = false;
  let parked = false;
  let pendingBytes = 0;
  let socketOpen = false;
  let startupSettled = false;
  let startupTimeout: number | undefined;
  const pending: ArrayBuffer[] = [];

  let rejectStartup: (error: Error | DOMException) => void;
  let resolveStartup: () => void;

  const finishStartup = (callback: () => void): void => {
    if (startupSettled) return;
    startupSettled = true;
    if (startupTimeout !== undefined) window.clearTimeout(startupTimeout);
    startupTimeout = undefined;
    signal.removeEventListener("abort", handleAbort);
    video.removeEventListener("loadeddata", handleLoadedData);
    mediaSource.removeEventListener("sourceopen", handleSourceOpen);
    socket.removeEventListener("open", handleSocketOpen);
    callback();
  };

  const fail = (message: string): void => {
    if (closed || failureReported) return;
    failureReported = true;
    const error = new Error(message);
    if (connected) onFailure(error);
    else rejectStartup(error);
  };

  const append = (): void => {
    if (!sourceBuffer || sourceBuffer.updating || pending.length === 0) return;
    const chunk = pending.shift();
    if (!chunk) return;
    pendingBytes = Math.max(0, pendingBytes - chunk.byteLength);
    try {
      sourceBuffer.appendBuffer(chunk);
    } catch {
      fail("Frigate MSE buffer append failed");
    }
  };
  const handleBufferUpdate = (): void => {
    try {
      if (video.buffered.length) {
        const liveEdge = video.buffered.end(video.buffered.length - 1);
        if (parked) {
          pending.length = 0;
          pendingBytes = 0;
          const bufferStart = video.buffered.start(0);
          const keepAfter = Math.max(bufferStart, liveEdge - 1);
          if (
            sourceBuffer &&
            !sourceBuffer.updating &&
            keepAfter > bufferStart
          ) {
            sourceBuffer.remove(bufferStart, keepAfter);
          }
          return;
        }
        const delay = liveEdge - video.currentTime;
        if (delay > 4) {
          video.currentTime = Math.max(0, liveEdge - 0.25);
          video.playbackRate = 1;
        } else {
          video.playbackRate = delay > 1 ? 1.05 : 1;
        }
        const trimBefore = video.currentTime - 10;
        if (
          sourceBuffer &&
          !sourceBuffer.updating &&
          trimBefore > 0 &&
          video.buffered.start(0) < trimBefore
        ) {
          sourceBuffer.remove(video.buffered.start(0), trimBefore);
          return;
        }
      }
      append();
    } catch {
      fail("Frigate MSE buffer maintenance failed");
    }
  };

  const start = (): void => {
    if (mediaOpen && socketOpen)
      socket.send(JSON.stringify({ type: "mse", value: CODECS }));
  };
  const handleAbort = (): void => {
    rejectStartup(new DOMException("Connection cancelled", "AbortError"));
  };
  const handleLoadedData = (): void => {
    connected = true;
    resolveStartup();
  };
  const handleSourceOpen = (): void => {
    mediaOpen = true;
    start();
  };
  const handleSocketOpen = (): void => {
    socketOpen = true;
    start();
  };
  const handleSourceBufferError = (): void => {
    fail("Frigate MSE decode failed");
  };
  const handleSocketMessage = (event: MessageEvent): void => {
    if (typeof event.data === "string") {
      let message: { readonly type?: string; readonly value?: string };
      try {
        message = JSON.parse(event.data) as typeof message;
      } catch {
        return;
      }
      if (message.type !== "mse" || !message.value || sourceBuffer) return;
      try {
        sourceBuffer = mediaSource.addSourceBuffer(message.value);
        sourceBuffer.addEventListener("updateend", handleBufferUpdate);
        sourceBuffer.addEventListener("error", handleSourceBufferError);
        append();
      } catch {
        fail("Frigate MSE source buffer setup failed");
      }
      return;
    }
    if (!(event.data instanceof ArrayBuffer) || parked) return;
    if (pendingBytes + event.data.byteLength > MAX_PENDING_MEDIA_BYTES) {
      fail("Frigate MSE decoder fell behind the live stream");
      return;
    }
    pending.push(event.data);
    pendingBytes += event.data.byteLength;
    append();
  };
  const handleSocketError = (): void => {
    fail("Frigate MSE WebSocket failed");
  };
  const handleSocketClose = (): void => {
    if (!closed) fail("Frigate MSE WebSocket closed");
  };
  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    if (startupTimeout !== undefined) window.clearTimeout(startupTimeout);
    startupTimeout = undefined;
    signal.removeEventListener("abort", handleAbort);
    video.removeEventListener("loadeddata", handleLoadedData);
    mediaSource.removeEventListener("sourceopen", handleSourceOpen);
    socket.removeEventListener("open", handleSocketOpen);
    socket.removeEventListener("message", handleSocketMessage);
    socket.removeEventListener("error", handleSocketError);
    socket.removeEventListener("close", handleSocketClose);
    sourceBuffer?.removeEventListener("updateend", handleBufferUpdate);
    sourceBuffer?.removeEventListener("error", handleSourceBufferError);
    pending.length = 0;
    pendingBytes = 0;
    socket.close();
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
    video.remove();
  };

  const ready = new Promise<void>((resolve, reject) => {
    resolveStartup = () => finishStartup(resolve);
    rejectStartup = (error) => finishStartup(() => reject(error));
    startupTimeout = window.setTimeout(
      () => fail("Timed out connecting to Frigate MSE"),
      CONNECT_TIMEOUT_MS,
    );
    signal.addEventListener("abort", handleAbort, { once: true });
    video.addEventListener("loadeddata", handleLoadedData, { once: true });
    mediaSource.addEventListener("sourceopen", handleSourceOpen, {
      once: true,
    });
    socket.addEventListener("open", handleSocketOpen, { once: true });
    socket.addEventListener("message", handleSocketMessage);
    socket.addEventListener("error", handleSocketError);
    socket.addEventListener("close", handleSocketClose);
  });

  try {
    await ready;
  } catch (error) {
    cleanup();
    throw error;
  }
  timing.mark("first_frame_decoded");
  return {
    timing,
    transport: "mse",
    video,
    park: () => {
      if (parked || closed) return;
      parked = true;
      pending.length = 0;
      video.pause();
      handleBufferUpdate();
    },
    resume: () => {
      if (!parked || closed) return;
      parked = false;
      if (video.buffered.length) {
        const liveEdge = video.buffered.end(video.buffered.length - 1);
        video.currentTime = Math.max(0, liveEdge - 0.25);
      }
      void playMediaElement(video).catch(() => undefined);
    },
    close: () => {
      cleanup();
    },
  };
}
