import type { MediaTransport } from "../../../core/media-session-manager";

export function mediaTransportLabel(
  transport: MediaTransport | undefined,
  lowLatencyHls: boolean,
): string | undefined {
  const hls = lowLatencyHls ? "HLS-LL" : "HLS";
  switch (transport) {
    case "webrtc":
      return "WebRTC";
    case "mse":
      return "MSE";
    case "hls_native":
      return `${hls} · native`;
    case "hls_mse":
      return `${hls} · HLS.js`;
    default:
      return undefined;
  }
}
