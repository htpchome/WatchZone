import type { LiveStartupTiming } from "./live-startup-timing";
import {
  MediaConnectionError,
  normalizeMediaConnectionError,
} from "./media-connection-error";
import type { MediaConnection } from "./media-session-manager";

export type WebRtcSignalingEvent =
  | {
      readonly type: "session";
      readonly sessionId: string;
      readonly path: string;
      readonly fallbackReason?: string | null;
    }
  | { readonly type: "answer"; readonly answer: string }
  | { readonly type: "candidate"; readonly candidate: RTCIceCandidateInit }
  | { readonly type: "error"; readonly message: string };

export interface WebRtcSignalingAdapter {
  sendCandidate(
    sessionId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void>;
  subscribe(
    offer: string,
    callback: (event: WebRtcSignalingEvent) => void,
  ): Promise<() => void>;
}

export interface WebRtcPeerConnectionOptions {
  readonly configuration: RTCConfiguration;
  readonly connectTimeoutMs: number;
  readonly dataChannel?: string;
  readonly disconnectedGraceMs: number;
  readonly onFailure: (error: Error) => void;
  readonly signal: AbortSignal;
  readonly signaling: WebRtcSignalingAdapter;
  readonly timing: LiveStartupTiming;
}

export interface WebRtcTalkPeerConnection {
  readonly signalingPath?: string;
  close(): void;
}

export interface WebRtcTalkPeerConnectionOptions {
  readonly configuration: RTCConfiguration;
  readonly connectTimeoutMs: number;
  readonly localStream: MediaStream;
  readonly signal: AbortSignal;
  readonly signaling: WebRtcSignalingAdapter;
  onFailure(error: Error): void;
  onSignalingPath(path: string): void;
}

function abortError(): DOMException {
  return new DOMException("Connection cancelled", "AbortError");
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
  if (!candidateLines) return offer;
  return `${offer}${offer.endsWith("\r\n") ? "" : "\r\n"}${candidateLines}`;
}

export async function createWebRtcPeerConnection(
  options: WebRtcPeerConnectionOptions,
): Promise<MediaConnection> {
  const {
    configuration,
    connectTimeoutMs,
    dataChannel,
    disconnectedGraceMs,
    onFailure,
    signal,
    signaling,
    timing,
  } = options;
  if (typeof RTCPeerConnection === "undefined") {
    throw new MediaConnectionError(
      "unsupported",
      "This browser does not support WebRTC",
    );
  }
  if (signal.aborted) throw abortError();

  const peer = new RTCPeerConnection(configuration);
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
    if (closed) return;
    closed = true;
    signal.removeEventListener("abort", handleAbort);
    unsubscribe?.();
    unsubscribe = undefined;
    if (disconnectedTimer) clearTimeout(disconnectedTimer);
    disconnectedTimer = undefined;
    peer.onconnectionstatechange = null;
    peer.onicecandidate = null;
    peer.ontrack = null;
    peer.close();
    for (const track of stream.getTracks()) track.stop();
  };

  const fail = (error: unknown): void => {
    if (closed) return;
    const normalized = normalizeMediaConnectionError(
      error,
      "peer_failed",
      "WebRTC connection failed",
    );
    if (connected) onFailure(normalized);
    else rejectPending?.(normalized);
  };

  const handleAbort = (): void => {
    if (connected) close();
    else rejectPending?.(abortError());
  };
  signal.addEventListener("abort", handleAbort, { once: true });

  const sendCandidate = async (
    candidate: RTCIceCandidateInit,
  ): Promise<void> => {
    if (!sessionId || closed) {
      localCandidates.push(candidate);
      return;
    }
    await signaling.sendCandidate(sessionId, candidate);
  };

  peer.onicecandidate = (event) => {
    if (!event.candidate?.candidate) return;
    timing.mark("first_local_candidate");
    void sendCandidate(event.candidate.toJSON()).catch((error: unknown) =>
      fail(
        normalizeMediaConnectionError(
          error,
          "signaling_failed",
          "Unable to send a WebRTC candidate",
        ),
      ),
    );
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === "failed") {
      if (disconnectedTimer) clearTimeout(disconnectedTimer);
      disconnectedTimer = undefined;
      fail(new MediaConnectionError("peer_failed", "WebRTC connection failed"));
    } else if (peer.connectionState === "disconnected") {
      disconnectedTimer ??= setTimeout(() => {
        disconnectedTimer = undefined;
        if (peer.connectionState === "disconnected") {
          fail(
            new MediaConnectionError(
              "peer_failed",
              "WebRTC connection remained disconnected",
            ),
          );
        }
      }, disconnectedGraceMs);
    } else if (disconnectedTimer) {
      clearTimeout(disconnectedTimer);
      disconnectedTimer = undefined;
    }
  };

  const ready = new Promise<MediaConnection>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      rejectPending?.(
        new MediaConnectionError(
          "connection_timeout",
          "Timed out connecting to the WebRTC stream",
        ),
      );
    }, connectTimeoutMs);

    rejectPending = (error: unknown) => {
      if (connected || closed) return;
      window.clearTimeout(timeout);
      const normalized = normalizeMediaConnectionError(
        error,
        "peer_failed",
        "WebRTC connection failed",
      );
      close();
      reject(normalized);
    };

    const handleSignalingEvent = async (
      event: WebRtcSignalingEvent,
    ): Promise<void> => {
      if (closed) return;
      try {
        if (event.type === "session") {
          timing.mark("session_received");
          timing.setSignaling(event.path, event.fallbackReason);
          sessionId = event.sessionId;
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
          if (peer.remoteDescription)
            await peer.addIceCandidate(event.candidate);
          else remoteCandidates.push(event.candidate);
        } else {
          fail(
            new MediaConnectionError(
              "signaling_failed",
              event.message || "WebRTC signaling failed",
            ),
          );
        }
      } catch (error) {
        fail(
          normalizeMediaConnectionError(
            error,
            "signaling_failed",
            "WebRTC signaling failed",
          ),
        );
      }
    };

    peer.ontrack = (event) => {
      const track = event.track;
      if (!stream.getTracks().some((current) => current.id === track.id)) {
        stream.addTrack(track);
      }
      if (track.kind === "video") {
        track.addEventListener(
          "ended",
          () => {
            const hasLiveReplacement = stream
              .getTracks()
              .some(
                (current) =>
                  current !== track &&
                  current.kind === "video" &&
                  current.readyState !== "ended",
              );
            if (!closed && !hasLiveReplacement) {
              fail(
                new MediaConnectionError(
                  "track_ended",
                  "WebRTC video track ended",
                ),
              );
            }
          },
          { once: true },
        );
      }
      if (!connected && track.kind === "video") {
        timing.mark("video_track_received");
        connected = true;
        window.clearTimeout(timeout);
        resolve({ stream, timing, transport: "webrtc", close });
      }
    };

    void (async () => {
      try {
        if (dataChannel) peer.createDataChannel(dataChannel);
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
          rejectPending?.(abortError());
          return;
        }
        const offerWithCandidates = appendIceCandidates(
          offer.sdp ?? "",
          localCandidates.splice(0),
        );
        timing.mark("signaling_started");
        unsubscribe = await signaling.subscribe(
          offerWithCandidates,
          (event) => {
            void handleSignalingEvent(event);
          },
        );
        if (closed) {
          unsubscribe();
          unsubscribe = undefined;
        }
      } catch (error) {
        fail(
          normalizeMediaConnectionError(
            error,
            "signaling_failed",
            "Unable to start WebRTC signaling",
          ),
        );
      }
    })();
  });

  return ready;
}

/** Creates an isolated send-only microphone peer without owning local tracks. */
export function createWebRtcTalkPeerConnection(
  options: WebRtcTalkPeerConnectionOptions,
): Promise<WebRtcTalkPeerConnection> {
  if (typeof RTCPeerConnection === "undefined") {
    return Promise.reject(
      new MediaConnectionError(
        "unsupported",
        "This browser does not support WebRTC",
      ),
    );
  }
  if (options.signal.aborted) return Promise.reject(abortError());

  const peer = new RTCPeerConnection(options.configuration);
  const localCandidates: RTCIceCandidateInit[] = [];
  const remoteCandidates: RTCIceCandidateInit[] = [];
  let closed = false;
  let sessionId: string | undefined;
  let signalingPath: string | undefined;
  let unsubscribe: (() => void) | undefined;
  let rejectPending: ((error: unknown) => void) | undefined;

  const close = (): void => {
    if (closed) return;
    closed = true;
    options.signal.removeEventListener("abort", handleAbort);
    unsubscribe?.();
    unsubscribe = undefined;
    peer.onconnectionstatechange = null;
    peer.oniceconnectionstatechange = null;
    peer.onicecandidate = null;
    peer.close();
  };
  const handleAbort = (): void => rejectPending?.(abortError());
  options.signal.addEventListener("abort", handleAbort, { once: true });

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(
      () => fail(new Error("Timed out connecting two-way talk")),
      options.connectTimeoutMs,
    );
    const finish = (callback: () => void, preserveConnection = false): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (!preserveConnection) close();
      callback();
    };
    const fail = (error: unknown): void => {
      const normalized = normalizeMediaConnectionError(
        error,
        "peer_failed",
        "Two-way talk connection failed",
      );
      if (settled) {
        close();
        options.onFailure(normalized);
        return;
      }
      finish(() => reject(normalized));
    };
    rejectPending = fail;
    const maybeResolve = (): void => {
      if (
        peer.connectionState === "connected" ||
        peer.iceConnectionState === "connected" ||
        peer.iceConnectionState === "completed"
      ) {
        finish(() => resolve({ signalingPath, close }), true);
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") fail(new Error("WebRTC failed"));
      else maybeResolve();
    };
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === "failed")
        fail(new Error("WebRTC ICE failed"));
      else maybeResolve();
    };
    const sendCandidate = async (
      candidate: RTCIceCandidateInit,
    ): Promise<void> => {
      if (!sessionId) {
        localCandidates.push(candidate);
        return;
      }
      await options.signaling.sendCandidate(sessionId, candidate);
    };
    peer.onicecandidate = (event) => {
      if (!event.candidate?.candidate) return;
      void sendCandidate(event.candidate.toJSON()).catch(fail);
    };

    const handleEvent = async (event: WebRtcSignalingEvent): Promise<void> => {
      if (closed) return;
      try {
        if (event.type === "session") {
          sessionId = event.sessionId;
          signalingPath = event.path;
          options.onSignalingPath(event.path);
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
          if (peer.remoteDescription)
            await peer.addIceCandidate(event.candidate);
          else remoteCandidates.push(event.candidate);
        } else {
          fail(new Error(event.message || "Talk signaling failed"));
        }
      } catch (error) {
        fail(error);
      }
    };

    void (async () => {
      try {
        for (const track of options.localStream.getAudioTracks()) {
          peer.addTransceiver(track, {
            direction: "sendonly",
            streams: [options.localStream],
          });
        }
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        const offerWithCandidates = appendIceCandidates(
          offer.sdp ?? "",
          localCandidates.splice(0),
        );
        unsubscribe = await options.signaling.subscribe(
          offerWithCandidates,
          (event) => void handleEvent(event),
        );
        if (closed) unsubscribe();
      } catch (error) {
        fail(error);
      }
    })();
  });
}
