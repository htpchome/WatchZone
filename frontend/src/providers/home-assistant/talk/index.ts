import {
  getTalkCapability,
  sendTalkCandidate,
  subscribeTalkOffer,
} from "../../../api/talk-signaling";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  answerAcceptsOutgoingAudio,
  createWebRtcTalkPeerConnection,
  type WebRtcSignalingEvent,
} from "../../../core/webrtc-peer-connection";
import type { TalkConnection } from "../../talk-source-resolver";

interface ClientConfiguration {
  readonly configuration: RTCConfiguration;
}

const CONNECT_TIMEOUT_MS = 8_000;
const CAPABILITY_PROBE_TIMEOUT_MS = 7_000;
const capabilityCache = new WeakMap<
  HomeAssistantApi["identity"],
  Map<string, Promise<boolean>>
>();

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
    const capability = await getTalkCapability(api, entityId);
    if (capability.supported || !capability.probeRequired)
      return capability.supported;

    let cameraCapabilities = capabilityCache.get(api.identity);
    if (!cameraCapabilities) {
      cameraCapabilities = new Map();
      capabilityCache.set(api.identity, cameraCapabilities);
    }
    const existing = cameraCapabilities.get(entityId);
    if (existing) return existing;
    const probe = this._probe(api, entityId).catch(() => false);
    cameraCapabilities.set(entityId, probe);
    return probe;
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

  private async _probe(
    api: HomeAssistantApi,
    entityId: string,
  ): Promise<boolean> {
    if (typeof RTCPeerConnection === "undefined") return false;
    const client = await api.callWS<ClientConfiguration>({
      type: "camera/webrtc/get_client_config",
      entity_id: entityId,
    });
    const peer = new RTCPeerConnection(client.configuration);
    let unsubscribe: (() => void) | undefined;
    try {
      peer.addTransceiver("audio", { direction: "sendonly" });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const pending: { timeout?: number } = {};
        const finish = (supported: boolean): void => {
          if (settled) return;
          settled = true;
          if (pending.timeout !== undefined)
            window.clearTimeout(pending.timeout);
          unsubscribe?.();
          resolve(supported);
        };
        pending.timeout = window.setTimeout(
          () => finish(false),
          CAPABILITY_PROBE_TIMEOUT_MS,
        );
        void subscribeTalkOffer(
          api,
          entityId,
          offer.sdp ?? "",
          true,
          (event) => {
            if (event.type === "answer")
              finish(answerAcceptsOutgoingAudio(event.answer));
            else if (event.type === "error") finish(false);
          },
          true,
        )
          .then((cleanup) => {
            unsubscribe = cleanup;
            if (settled) cleanup();
          })
          .catch(() => finish(false));
      });
    } finally {
      unsubscribe?.();
      peer.close();
    }
  }
}
