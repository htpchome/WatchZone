import { getBrowserLiveSource } from "../../../api/live-signaling";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import type { LiveStartupTiming } from "../../../core/live-startup-timing";
import type {
  MediaConnection,
  MediaConnectionOptions,
} from "../../../core/media-session-manager";

const CONNECT_TIMEOUT_MS = 15_000;

interface SignedPathResult {
  readonly path: string;
}

function abortError(): DOMException {
  return new DOMException("Connection cancelled", "AbortError");
}

export async function createFrigateMseConnection(
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
  timing: LiveStartupTiming,
  options: MediaConnectionOptions = { initialMuted: true },
): Promise<MediaConnection> {
  if (signal.aborted) throw abortError();
  const source = await getBrowserLiveSource(api, "frigate", entityId);
  const signed = await api.callWS<SignedPathResult | string>({
    type: "auth/sign_path",
    path: source.websocket_path,
    expires: 30,
  });
  const signedPath = typeof signed === "string" ? signed : signed.path;
  if (!signedPath)
    throw new Error("Home Assistant did not sign the Frigate source");

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.muted = options.initialMuted;
  video.defaultMuted = options.initialMuted;
  video.preload = "auto";
  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  video.src = objectUrl;
  options.onVideo?.(video);

  const resolved = new URL(api.resolveUrl(signedPath));
  resolved.protocol = resolved.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(resolved);
  socket.binaryType = "arraybuffer";
  let sourceBuffer: SourceBuffer | undefined;
  const pending: ArrayBuffer[] = [];
  let closed = false;
  let settled = false;
  const handleAbort = (): void => fail(abortError());

  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", handleAbort);
    socket.close();
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  };
  const fail = (error: Error): void => {
    if (closed) return;
    if (!settled) {
      rejectConnection(error);
      return;
    }
    cleanup();
    onFailure(error);
  };
  const appendNext = (): void => {
    if (!sourceBuffer || sourceBuffer.updating || pending.length === 0) return;
    sourceBuffer.appendBuffer(pending.shift()!);
  };

  let resolveConnection!: (connection: MediaConnection) => void;
  let rejectConnection!: (error: Error) => void;
  const connected = new Promise<MediaConnection>((resolve, reject) => {
    resolveConnection = resolve;
    rejectConnection = (error) => {
      cleanup();
      reject(error);
    };
  });
  const timeout = window.setTimeout(
    () => fail(new Error("Timed out connecting to Frigate MSE")),
    CONNECT_TIMEOUT_MS,
  );
  signal.addEventListener("abort", handleAbort, { once: true });

  mediaSource.addEventListener(
    "sourceopen",
    () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({ type: "mse", value: "video/mp4; codecs=*" }),
        );
      }
    },
    { once: true },
  );
  socket.addEventListener("open", () => {
    timing.mark("signaling_started");
    if (mediaSource.readyState === "open") {
      socket.send(
        JSON.stringify({ type: "mse", value: "video/mp4; codecs=*" }),
      );
    }
  });
  socket.addEventListener("message", (event) => {
    if (typeof event.data === "string") {
      let message: { type?: string; value?: unknown };
      try {
        message = JSON.parse(event.data) as {
          type?: string;
          value?: unknown;
        };
      } catch {
        fail(new Error("Frigate returned invalid MSE signaling"));
        return;
      }
      if (message.type === "error") {
        fail(new Error("Frigate rejected the MSE connection"));
        return;
      }
      if (message.type !== "mse" || typeof message.value !== "string") return;
      try {
        sourceBuffer = mediaSource.addSourceBuffer(message.value);
        sourceBuffer.addEventListener("updateend", appendNext);
        appendNext();
      } catch (error) {
        fail(
          error instanceof Error ? error : new Error("Unsupported MSE stream"),
        );
      }
      return;
    }
    if (!(event.data instanceof ArrayBuffer)) return;
    pending.push(event.data);
    appendNext();
  });
  socket.addEventListener("error", () =>
    fail(new Error("Frigate MSE socket failed")),
  );
  socket.addEventListener("close", () => {
    if (!closed) fail(new Error("Frigate MSE socket closed"));
  });
  video.addEventListener(
    "loadeddata",
    () => {
      if (settled || closed) return;
      settled = true;
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", handleAbort);
      timing.mark("first_frame_decoded");
      void video.play().catch(() => undefined);
      resolveConnection({
        close: cleanup,
        timing,
        transport: "mse",
        video,
      });
    },
    { once: true },
  );
  return connected;
}
