import type { HomeAssistantApi } from "../../core/home-assistant";
import type { MediaConnection } from "../../core/media-session-manager";

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

function abortError(): DOMException {
  return new DOMException("Connection cancelled", "AbortError");
}

function normalizeError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("Home Assistant camera connection failed");
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
): Promise<MediaConnection> {
  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("This browser does not support WebRTC");
  }
  if (signal.aborted) {
    throw abortError();
  }

  const client = await api.callWS<ClientConfiguration>({
    type: "camera/webrtc/get_client_config",
    entity_id: entityId,
  });
  if (signal.aborted) {
    throw abortError();
  }

  const peer = new RTCPeerConnection(client.configuration);
  const stream = new MediaStream();
  let closed = false;
  let connected = false;
  let sessionId: string | undefined;
  let unsubscribe: (() => void) | undefined;
  let rejectPending: ((error: unknown) => void) | undefined;
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
      void sendCandidate(event.candidate.toJSON());
    }
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === "failed") {
      fail(new Error("Home Assistant camera WebRTC connection failed"));
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
          sessionId = event.session_id;
          await Promise.all(localCandidates.splice(0).map(sendCandidate));
        } else if (event.type === "answer") {
          await peer.setRemoteDescription({
            type: "answer",
            sdp: event.answer,
          });
          await Promise.all(
            remoteCandidates
              .splice(0)
              .map((candidate) => peer.addIceCandidate(candidate)),
          );
        } else if (event.type === "candidate") {
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
        connected = true;
        window.clearTimeout(timeout);
        resolve({ stream, close });
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
        await peer.setLocalDescription(offer);
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
