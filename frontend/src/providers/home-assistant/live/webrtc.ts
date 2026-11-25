import {
  sendLiveCandidate,
  subscribeLiveOffer,
  type LiveOfferEvent,
} from "../../../api/live-signaling";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import type { LiveStartupTiming } from "../../../core/live-startup-timing";
import { requestWebRtcClientConfiguration } from "../../live/webrtc-client-configuration";
import type {
  MediaConnection,
  MediaConnectionOptions,
} from "../../../core/media-session-manager";
import {
  attachWebRtcVideo,
  createWebRtcPeerConnection,
  type WebRtcSignalingEvent,
} from "../../../core/webrtc-peer-connection";

const CONNECT_TIMEOUT_MS = 15_000;
const DISCONNECTED_GRACE_MS = 5_000;

function abortError(): DOMException {
  return new DOMException("Connection cancelled", "AbortError");
}

function mapSignalingEvent(event: LiveOfferEvent): WebRtcSignalingEvent {
  if (event.type === "session") {
    return {
      type: "session",
      sessionId: event.session_id,
      path: event.signaling_path,
      fallbackReason: event.signaling_fallback_reason,
    };
  }
  return event;
}

export async function createHomeAssistantWebRtcConnection(
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
  timing: LiveStartupTiming,
  options: MediaConnectionOptions = { initialMuted: true },
): Promise<MediaConnection> {
  if (signal.aborted) throw abortError();

  timing.mark("client_config_requested");
  const client = await requestWebRtcClientConfiguration(
    api,
    entityId,
    signal,
    CONNECT_TIMEOUT_MS,
  );
  timing.mark("client_config_received");

  const connection = await createWebRtcPeerConnection({
    configuration: client.configuration,
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
    dataChannel: client.dataChannel,
    disconnectedGraceMs: DISCONNECTED_GRACE_MS,
    onFailure,
    signal,
    signaling: {
      sendCandidate: async (sessionId, candidate) => {
        await sendLiveCandidate(api, entityId, sessionId, candidate);
      },
      subscribe: (offer, callback) =>
        subscribeLiveOffer(api, entityId, offer, (event) =>
          callback(mapSignalingEvent(event)),
        ),
    },
    timing,
  });
  return attachWebRtcVideo(connection, options.initialMuted, options.onVideo);
}
