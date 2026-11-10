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
import {
  MediaConnectionError,
  normalizeMediaConnectionError,
} from "../../../core/media-connection-error";
import type {
  MediaConnection,
  MediaConnectionOptions,
} from "../../../core/media-session-manager";
import {
  createWebRtcPeerConnection,
  type WebRtcSignalingEvent,
} from "../../../core/webrtc-peer-connection";

interface ClientConfiguration {
  readonly configuration: RTCConfiguration;
  readonly dataChannel?: string;
}

const CONNECT_TIMEOUT_MS = 15_000;
const DISCONNECTED_GRACE_MS = 5_000;

function abortError(): DOMException {
  return new DOMException("Connection cancelled", "AbortError");
}

function requestClientConfiguration(
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
): Promise<ClientConfiguration> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", handleAbort);
      callback();
    };
    const handleAbort = (): void => finish(() => reject(abortError()));
    const timeout = window.setTimeout(
      () =>
        finish(() =>
          reject(
            new MediaConnectionError(
              "configuration_timeout",
              "Timed out requesting Home Assistant WebRTC configuration",
            ),
          ),
        ),
      CONNECT_TIMEOUT_MS,
    );
    signal.addEventListener("abort", handleAbort, { once: true });
    if (signal.aborted) {
      handleAbort();
      return;
    }
    void api
      .callWS<ClientConfiguration>({
        type: "camera/webrtc/get_client_config",
        entity_id: entityId,
      })
      .then(
        (configuration) => finish(() => resolve(configuration)),
        (error: unknown) =>
          finish(() =>
            reject(
              normalizeMediaConnectionError(
                error,
                "signaling_failed",
                "Unable to request Home Assistant WebRTC configuration",
              ),
            ),
          ),
      );
  });
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
  const client = await requestClientConfiguration(api, entityId, signal);
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
