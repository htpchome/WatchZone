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

interface ClientConfiguration {
  readonly configuration: RTCConfiguration;
}

const CONNECT_TIMEOUT_MS = 8_000;

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

/** Home Assistant talk capability with accelerated Frigate signaling. */
export class HomeAssistantTalkProvider {
  public async supports(
    api: HomeAssistantApi,
    entityId: string,
  ): Promise<boolean> {
    return getTalkCapability(api, entityId);
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
    let peer:
      Awaited<ReturnType<typeof createWebRtcTalkPeerConnection>> | undefined;
    try {
      const client = await api.callWS<ClientConfiguration>({
        type: "camera/webrtc/get_client_config",
        entity_id: entityId,
      });
      let attemptedPath: string | undefined;
      const connectAttempt = (forceStandard: boolean) =>
        createWebRtcTalkPeerConnection({
          configuration: client.configuration,
          connectTimeoutMs: CONNECT_TIMEOUT_MS,
          localStream,
          onFailure,
          signal,
          onSignalingPath: (path) => {
            attemptedPath = path;
          },
          signaling: {
            sendCandidate: (sessionId, candidate) =>
              sendTalkCandidate(api, entityId, sessionId, candidate).then(
                () => undefined,
              ),
            subscribe: (offer, callback) =>
              subscribeTalkOffer(api, entityId, offer, forceStandard, (event) =>
                callback(mapEvent(event)),
              ),
          },
        });

      try {
        peer = await connectAttempt(false);
      } catch (error) {
        if (attemptedPath !== "frigate:trickle_ice" || signal.aborted)
          throw error;
        attemptedPath = undefined;
        peer = await connectAttempt(true);
      }
      return {
        localStream,
        signalingPath: peer.signalingPath,
        close: () => {
          peer?.close();
          for (const track of localStream.getTracks()) track.stop();
        },
        setMicrophoneMuted: (muted) => {
          for (const track of localStream.getAudioTracks())
            track.enabled = !muted;
        },
      };
    } catch (error) {
      peer?.close();
      for (const track of localStream.getTracks()) track.stop();
      throw error;
    }
  }
}
