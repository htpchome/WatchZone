import {
  getTalkCapability,
  sendTalkCandidate,
  subscribeTalkOffer,
} from "../../../api/talk-signaling";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  createWebRtcTalkPeerConnection,
  type WebRtcSignalingEvent,
} from "../../../core/webrtc-peer-connection";
import type { TalkConnection } from "../../talk-source-resolver";

const CONNECT_TIMEOUT_MS = 8_000;

export class FrigateTalkProvider {
  public supports(api: HomeAssistantApi, entityId: string): Promise<boolean> {
    return getTalkCapability(api, entityId, "frigate");
  }

  public async connect(
    api: HomeAssistantApi,
    entityId: string,
    signal: AbortSignal,
    onFailure: (error: Error) => void,
  ): Promise<TalkConnection> {
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    try {
      let signalingPath: string | undefined;
      const peer = await createWebRtcTalkPeerConnection({
        configuration: {},
        connectTimeoutMs: CONNECT_TIMEOUT_MS,
        localStream,
        onFailure,
        onSignalingPath: (path) => {
          signalingPath = path;
        },
        signal,
        signaling: {
          sendCandidate: (sessionId, candidate) =>
            sendTalkCandidate(api, entityId, sessionId, candidate).then(
              () => undefined,
            ),
          subscribe: (offer, callback) =>
            subscribeTalkOffer(
              api,
              entityId,
              offer,
              false,
              (event) => callback(mapEvent(event)),
              false,
              "frigate",
            ),
        },
      });
      return {
        localStream,
        signalingPath: peer.signalingPath ?? signalingPath,
        close: () => {
          peer.close();
          for (const track of localStream.getTracks()) track.stop();
        },
        setMicrophoneMuted: (muted) => {
          for (const track of localStream.getAudioTracks())
            track.enabled = !muted;
        },
      };
    } catch (error) {
      for (const track of localStream.getTracks()) track.stop();
      throw error;
    }
  }
}

function mapEvent(
  event: import("../../../api/live-signaling").LiveOfferEvent,
): WebRtcSignalingEvent {
  return event.type === "session"
    ? {
        type: "session",
        sessionId: event.session_id,
        path: event.signaling_path,
        fallbackReason: event.signaling_fallback_reason,
      }
    : event;
}
