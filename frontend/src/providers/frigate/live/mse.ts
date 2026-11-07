import type { FrigateGo2RtcLiveSourceDescriptor } from "../../../api/live-source";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import type { LiveStartupTiming } from "../../../core/live-startup-timing";
import { setMediaElementMuted } from "../../../core/media-playback";
import type {
  MediaConnection,
  MediaConnectionOptions,
} from "../../../core/media-session-manager";

const CONNECT_TIMEOUT_MS = 15_000;
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
  const pending: ArrayBuffer[] = [];

  const fail = (message: string): void => {
    const error = new Error(message);
    if (connected) onFailure(error);
  };
  const append = (): void => {
    if (!sourceBuffer || sourceBuffer.updating || pending.length === 0) return;
    const chunk = pending.shift();
    if (chunk) sourceBuffer.appendBuffer(chunk);
  };
  const handleBufferUpdate = (): void => {
    if (video.buffered.length) {
      const liveEdge = video.buffered.end(video.buffered.length - 1);
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
  };

  const ready = new Promise<void>((resolve, reject) => {
    let mediaOpen = false;
    let socketOpen = false;
    const start = (): void => {
      if (mediaOpen && socketOpen)
        socket.send(JSON.stringify({ type: "mse", value: CODECS }));
    };
    const timeout = window.setTimeout(
      () => reject(new Error("Timed out connecting to Frigate MSE")),
      CONNECT_TIMEOUT_MS,
    );
    const finish = (callback: () => void): void => {
      window.clearTimeout(timeout);
      callback();
    };
    signal.addEventListener(
      "abort",
      () =>
        finish(() =>
          reject(new DOMException("Connection cancelled", "AbortError")),
        ),
      { once: true },
    );
    video.addEventListener(
      "loadeddata",
      () =>
        finish(() => {
          connected = true;
          resolve();
        }),
      { once: true },
    );
    mediaSource.addEventListener(
      "sourceopen",
      () => {
        mediaOpen = true;
        start();
      },
      { once: true },
    );
    socket.addEventListener(
      "open",
      () => {
        socketOpen = true;
        start();
      },
      { once: true },
    );
    socket.addEventListener("message", (event) => {
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
          sourceBuffer.addEventListener("error", () =>
            fail("Frigate MSE decode failed"),
          );
          append();
        } catch (error) {
          finish(() => reject(error));
        }
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        pending.push(event.data);
        append();
      }
    });
    socket.addEventListener("error", () => {
      if (connected) fail("Frigate MSE WebSocket failed");
      else finish(() => reject(new Error("Frigate MSE WebSocket failed")));
    });
    socket.addEventListener("close", () => {
      if (closed) return;
      if (connected) fail("Frigate MSE WebSocket closed");
      else finish(() => reject(new Error("Frigate MSE WebSocket closed")));
    });
  });

  try {
    await ready;
  } catch (error) {
    closed = true;
    socket.close();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
    video.remove();
    throw error;
  }
  timing.mark("first_frame_decoded");
  return {
    timing,
    transport: "mse",
    video,
    close: () => {
      if (closed) return;
      closed = true;
      socket.close();
      sourceBuffer?.removeEventListener("updateend", handleBufferUpdate);
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
      video.remove();
    },
  };
}
