import {
  sendLiveCandidate,
  subscribeProviderLiveOffer,
  type LiveOfferEvent,
} from "../../../api/live-signaling";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import type { LiveStartupTiming } from "../../../core/live-startup-timing";
import type { MediaConnection } from "../../../core/media-session-manager";
import {
  createWebRtcPeerConnection,
  type WebRtcSignalingEvent,
} from "../../../core/webrtc-peer-connection";

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

export function createFrigateWebRtcConnection(
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
  timing: LiveStartupTiming,
): Promise<MediaConnection> {
  return createWebRtcPeerConnection({
    configuration: {},
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
    disconnectedGraceMs: DISCONNECTED_GRACE_MS,
    onFailure,
    signal,
    signaling: {
      sendCandidate: (sessionId, candidate) =>
        sendLiveCandidate(api, entityId, sessionId, candidate).then(
          () => undefined,
        ),
      subscribe: (offer, callback) =>
        subscribeProviderLiveOffer(api, "frigate", entityId, offer, (event) =>
          callback(mapEvent(event)),
        ),
    },
    timing,
  });
}
