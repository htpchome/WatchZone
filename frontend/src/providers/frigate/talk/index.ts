import {
  getTalkCapability,
  sendTalkCandidate,
  subscribeTalkOffer,
} from "../../../api/talk-signaling";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import { createWebRtcTalkPeerConnection } from "../../../core/webrtc-peer-connection";
import type { TalkConnection } from "../../talk-source-resolver";

const CONNECT_TIMEOUT_MS = 8_000;

/** Direct Frigate go2rtc talk without cross-provider fallback. */
export class FrigateTalkProvider {
  public supports(api: HomeAssistantApi, entityId: string): Promise<boolean> {
    return getTalkCapability(api, "frigate_go2rtc", entityId);
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
      const client = await api.callWS<{
        readonly configuration: RTCConfiguration;
      }>({ type: "camera/webrtc/get_client_config", entity_id: entityId });
      let signalingPath: string | undefined;
      peer = await createWebRtcTalkPeerConnection({
        configuration: client.configuration,
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
              "frigate_go2rtc",
              entityId,
              offer,
              false,
              (event) =>
                callback(
                  event.type === "session"
                    ? {
                        type: "session",
                        sessionId: event.session_id,
                        path: event.signaling_path,
                        fallbackReason: event.signaling_fallback_reason,
                      }
                    : event,
                ),
            ),
        },
      });
      return {
        localStream,
        signalingPath: peer.signalingPath ?? signalingPath,
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
