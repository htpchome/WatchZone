import {
  sendLiveCandidate,
  subscribeLiveOffer,
  type LiveOfferEvent,
} from "../../../api/live-signaling";
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

/** WebRTC media through the explicitly selected Frigate go2rtc provider. */
export async function createFrigateWebRtcConnection(
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
  timing: LiveStartupTiming,
  options: MediaConnectionOptions = { initialMuted: true },
): Promise<MediaConnection> {
  const client = await api.callWS<{
    readonly configuration: RTCConfiguration;
    readonly dataChannel?: string;
  }>({ type: "camera/webrtc/get_client_config", entity_id: entityId });
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
        ),
    },
    timing,
  });
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  setMediaElementMuted(video, options.initialMuted);
  video.srcObject = connection.stream ?? null;
  return {
    ...connection,
    video,
    park: () => video.pause(),
    resume: () => void playMediaElement(video).catch(() => undefined),
    close: () => {
      video.pause();
      video.srcObject = null;
      video.remove();
      connection.close();
    },
  };
}
