import {
  sendLiveCandidate,
  subscribeLiveOffer,
  type LiveOfferEvent,
} from "../../../api/live-signaling";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import type { LiveStartupTiming } from "../../../core/live-startup-timing";
import type {
  MediaConnection,
  MediaConnectionOptions,
} from "../../../core/media-session-manager";
import {
  attachWebRtcVideo,
  createWebRtcPeerConnection,
  type WebRtcSignalingEvent,
} from "../../../core/webrtc-peer-connection";
import { requestWebRtcClientConfiguration } from "../../live/webrtc-client-configuration";

const CONNECT_TIMEOUT_MS = 15_000;
const DISCONNECTED_GRACE_MS = 5_000;

function mapEvent(event: LiveOfferEvent): WebRtcSignalingEvent {
  return event.type === "session"
    ? {
        type: "session",
        sessionId: event.session_id,
        path: event.signaling_path,
        fallbackReason: event.signaling_fallback_reason,
      }
    : event;
}

/** WebRTC media through the explicitly selected Frigate go2rtc provider. */
export async function createFrigateWebRtcConnection(
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
  timing: LiveStartupTiming,
  options: MediaConnectionOptions = { initialMuted: true },
  sourceKey?: string,
): Promise<MediaConnection> {
  const client = await requestWebRtcClientConfiguration(
    api,
    entityId,
    signal,
    CONNECT_TIMEOUT_MS,
  );
  const connection = await createWebRtcPeerConnection({
    configuration: client.configuration,
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
    dataChannel: client.dataChannel,
    disconnectedGraceMs: DISCONNECTED_GRACE_MS,
    onFailure,
    signal,
    signaling: {
      sendCandidate: (sessionId, candidate) =>
        sendLiveCandidate(api, entityId, sessionId, candidate).then(
          () => undefined,
        ),
      subscribe: (offer, callback) =>
        subscribeLiveOffer(
          api,
          entityId,
          offer,
          (event) => callback(mapEvent(event)),
          "frigate_go2rtc",
          sourceKey,
        ),
    },
    timing,
  });
  return attachWebRtcVideo(connection, options.initialMuted, options.onVideo);
}
