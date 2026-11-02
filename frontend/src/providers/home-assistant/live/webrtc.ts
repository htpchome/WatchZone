import type { HomeAssistantApi } from "../../../core/home-assistant";
import type { LiveStartupTiming } from "../../../core/live-startup-timing";
import type {
  MediaConnection,
  MediaConnectionOptions,
} from "../../../core/media-session-manager";

interface ClientConfiguration {
  readonly configuration: RTCConfiguration;
  readonly dataChannel?: string;
}

type OfferEvent =
  | { readonly type: "session"; readonly session_id: string }
  | { readonly type: "answer"; readonly answer: string }
  | { readonly type: "candidate"; readonly candidate: RTCIceCandidateInit }
  | { readonly type: "error"; readonly message: string };

const CONNECT_TIMEOUT_MS = 15_000;
const DISCONNECTED_GRACE_MS = 5_000;

function abortError(): DOMException {
  return new DOMException("Connection cancelled", "AbortError");
}

function normalizeError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("Home Assistant camera connection failed");
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
            new Error(
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
        (error: unknown) => finish(() => reject(normalizeError(error))),
      );
  });
}

function appendIceCandidates(
  offer: string,
  candidates: readonly RTCIceCandidateInit[],
): string {
  const candidateLines = candidates
    .map((candidate) => candidate.candidate?.trim())
    .filter((candidate): candidate is string => Boolean(candidate))
    .map((candidate) => `a=${candidate}\r\n`)
    .join("");
  if (!candidateLines) {
    return offer;
  }
  return `${offer}${offer.endsWith("\r\n") ? "" : "\r\n"}${candidateLines}`;
}

export async function createHomeAssistantWebRtcConnection(
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
  timing: LiveStartupTiming,
  _options: MediaConnectionOptions = { initialMuted: true },
): Promise<MediaConnection> {
  void _options;
  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("This browser does not support WebRTC");
  }
  if (signal.aborted) {
    throw abortError();
  }

  timing.mark("client_config_requested");
  const client = await requestClientConfiguration(api, entityId, signal);
  timing.mark("client_config_received");
  if (signal.aborted) {
    throw abortError();
  }

  const peer = new RTCPeerConnection(client.configuration);
  timing.mark("peer_created");
  const stream = new MediaStream();
  let closed = false;
  let connected = false;
  let sessionId: string | undefined;
  let unsubscribe: (() => void) | undefined;
  let rejectPending: ((error: unknown) => void) | undefined;
  let disconnectedTimer: ReturnType<typeof setTimeout> | undefined;
  const localCandidates: RTCIceCandidateInit[] = [];
  const remoteCandidates: RTCIceCandidateInit[] = [];

  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    signal.removeEventListener("abort", handleAbort);
    unsubscribe?.();
    unsubscribe = undefined;
    if (disconnectedTimer) {
      clearTimeout(disconnectedTimer);
      disconnectedTimer = undefined;
    }
    peer.onconnectionstatechange = null;
    peer.onicecandidate = null;
    peer.ontrack = null;
    peer.close();
    for (const track of stream.getTracks()) {
      track.stop();
    }
  };

  const fail = (error: unknown): void => {
    const normalized = normalizeError(error);
    if (connected) {
      onFailure(normalized);
    }
  };

  const handleAbort = (): void => {
    if (connected) {
      close();
    } else {
      rejectPending?.(abortError());
    }
  };
  signal.addEventListener("abort", handleAbort, { once: true });

  const sendCandidate = async (
    candidate: RTCIceCandidateInit,
  ): Promise<void> => {
    if (!sessionId || closed) {
      localCandidates.push(candidate);
      return;
    }
    try {
      await api.callWS({
        type: "camera/webrtc/candidate",
        entity_id: entityId,
        session_id: sessionId,
        candidate,
      });
    } catch (error) {
      fail(error);
    }
  };

  peer.onicecandidate = (event) => {
    if (event.candidate?.candidate) {
      timing.mark("first_local_candidate");
      void sendCandidate(event.candidate.toJSON());
    }
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === "failed") {
      if (disconnectedTimer) {
        clearTimeout(disconnectedTimer);
        disconnectedTimer = undefined;
      }
      fail(new Error("Home Assistant camera WebRTC connection failed"));
    } else if (peer.connectionState === "disconnected") {
      disconnectedTimer ??= setTimeout(() => {
        disconnectedTimer = undefined;
        if (peer.connectionState === "disconnected") {
          fail(
            new Error(
              "Home Assistant camera WebRTC connection remained disconnected",
            ),
          );
        }
      }, DISCONNECTED_GRACE_MS);
    } else if (disconnectedTimer) {
      clearTimeout(disconnectedTimer);
      disconnectedTimer = undefined;
    }
  };

  const ready = new Promise<MediaConnection>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      close();
      reject(new Error("Timed out connecting to the Home Assistant camera"));
    }, CONNECT_TIMEOUT_MS);

    const rejectStart = (error: unknown): void => {
      if (connected || closed) {
        return;
      }
      window.clearTimeout(timeout);
      close();
      reject(normalizeError(error));
    };
    rejectPending = rejectStart;

    const handleOfferEvent = async (event: OfferEvent): Promise<void> => {
      if (closed) {
        return;
      }
      try {
        if (event.type === "session") {
          timing.mark("session_received");
          sessionId = event.session_id;
          await Promise.all(localCandidates.splice(0).map(sendCandidate));
        } else if (event.type === "answer") {
          timing.mark("answer_received");
          await peer.setRemoteDescription({
            type: "answer",
            sdp: event.answer,
          });
          timing.mark("remote_description_set");
          await Promise.all(
            remoteCandidates
              .splice(0)
              .map((candidate) => peer.addIceCandidate(candidate)),
          );
        } else if (event.type === "candidate") {
          timing.mark("first_remote_candidate");
          if (peer.remoteDescription) {
            await peer.addIceCandidate(event.candidate);
          } else {
            remoteCandidates.push(event.candidate);
          }
        } else {
          const error = new Error(event.message || "Camera rejected WebRTC");
          if (connected) {
            fail(error);
          } else {
            rejectStart(error);
          }
        }
      } catch (error) {
        rejectStart(error);
        fail(error);
      }
    };

    peer.ontrack = (event) => {
      if (!stream.getTracks().some((track) => track.id === event.track.id)) {
        stream.addTrack(event.track);
      }
      if (!connected && event.track.kind === "video") {
        timing.mark("video_track_received");
        connected = true;
        window.clearTimeout(timeout);
        resolve({ stream, timing, transport: "webrtc", close });
      }
    };

    void (async () => {
      try {
        if (client.dataChannel) {
          peer.createDataChannel(client.dataChannel);
        }
        peer.addTransceiver("audio", { direction: "recvonly" });
        peer.addTransceiver("video", { direction: "recvonly" });
        const offer = await peer.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        timing.mark("offer_created");
        await peer.setLocalDescription(offer);
        timing.mark("local_description_set");
        if (closed || signal.aborted) {
          rejectStart(abortError());
          return;
        }
        const offerWithCandidates = appendIceCandidates(
          offer.sdp ?? "",
          localCandidates.splice(0),
        );
        const unsubscribePromise = api.subscribeMessage<OfferEvent>(
          (event) => void handleOfferEvent(event),
          {
            type: "camera/webrtc/offer",
            entity_id: entityId,
            offer: offerWithCandidates,
          },
        );
        timing.mark("signaling_started");
        unsubscribe = await unsubscribePromise;
        if (closed) {
          unsubscribe();
          unsubscribe = undefined;
        }
      } catch (error) {
        rejectStart(error);
      }
    })();
  });

  return ready;
}
