import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHomeAssistantWebRtcConnection } from "../src/providers/home-assistant/live/webrtc";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import { LiveStartupTiming } from "../src/core/live-startup-timing";

class FakeTrack extends EventTarget {
  public readonly kind = "video";
  public readyState: MediaStreamTrackState = "live";
  public readonly stop = vi.fn();

  public constructor(public readonly id = "video-track") {
    super();
  }

  public end(): void {
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }
}

class FakeMediaStream {
  private readonly _tracks: FakeTrack[] = [];

  public addTrack(track: FakeTrack): void {
    this._tracks.push(track);
  }

  public getTracks(): FakeTrack[] {
    return this._tracks;
  }
}

class FakePeerConnection {
  public static instance?: FakePeerConnection;

  public connectionState: RTCPeerConnectionState = "new";
  public onconnectionstatechange: (() => void) | null = null;
  public onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null =
    null;
  public ontrack: ((event: RTCTrackEvent) => void) | null = null;
  public remoteDescription: RTCSessionDescription | null = null;
  public readonly addIceCandidate = vi.fn(async () => undefined);
  public readonly addTransceiver = vi.fn();
  public readonly close = vi.fn();
  public readonly createDataChannel = vi.fn();
  public readonly createOffer = vi.fn(async () => ({
    type: "offer" as RTCSdpType,
    sdp: "watchzone-offer",
  }));
  public readonly setLocalDescription = vi.fn(async () => {
    this.onicecandidate?.({
      candidate: {
        candidate: "candidate:early 1 udp 1 192.0.2.1 1234 typ host",
        toJSON: () => ({
          candidate: "candidate:early 1 udp 1 192.0.2.1 1234 typ host",
        }),
      },
    } as unknown as RTCPeerConnectionIceEvent);
  });
  public readonly setRemoteDescription = vi.fn(async (description) => {
    this.remoteDescription = description as RTCSessionDescription;
  });

  public constructor(public readonly configuration: RTCConfiguration) {
    FakePeerConnection.instance = this;
  }
}

describe("Home Assistant WebRTC connection", () => {
  const originalMediaStream = globalThis.MediaStream;
  const originalPeerConnection = globalThis.RTCPeerConnection;

  beforeEach(() => {
    FakePeerConnection.instance = undefined;
    globalThis.MediaStream = FakeMediaStream as unknown as typeof MediaStream;
    globalThis.RTCPeerConnection =
      FakePeerConnection as unknown as typeof RTCPeerConnection;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.MediaStream = originalMediaStream;
    globalThis.RTCPeerConnection = originalPeerConnection;
  });

  it("bounds a client-configuration request stalled by an HA reboot", async () => {
    vi.useFakeTimers();
    const callWS = vi.fn(() => new Promise(() => undefined));
    const api: HomeAssistantApi = {
      identity: {} as HomeAssistantApi["identity"],
      callWS: callWS as HomeAssistantApi["callWS"],
      resolveUrl: (path) => path,
      subscribeMessage: vi.fn(),
    };
    const connecting = createHomeAssistantWebRtcConnection(
      api,
      "camera.front",
      new AbortController().signal,
      vi.fn(),
      new LiveStartupTiming("home_assistant:camera.front"),
    );
    const rejection = expect(connecting).rejects.toThrow(
      "Timed out requesting Home Assistant WebRTC configuration",
    );

    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    expect(FakePeerConnection.instance).toBeUndefined();
  });

  it("negotiates immediately and buffers candidates until they are usable", async () => {
    let offerCallback: ((event: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    const callWS = vi.fn(async (message: { type: string }) => {
      if (message.type === "camera/webrtc/get_client_config") {
        return { configuration: { iceServers: [] }, dataChannel: "camera" };
      }
      return undefined;
    });
    const api: HomeAssistantApi = {
      identity: {} as HomeAssistantApi["identity"],
      callWS: callWS as HomeAssistantApi["callWS"],
      resolveUrl: (path) => path,
      subscribeMessage: vi.fn(async (callback) => {
        offerCallback = callback as (event: unknown) => void;
        return unsubscribe;
      }),
    };
    const onFailure = vi.fn();
    const timing = new LiveStartupTiming("home_assistant:camera.front");

    const connecting = createHomeAssistantWebRtcConnection(
      api,
      "camera.front",
      new AbortController().signal,
      onFailure,
      timing,
    );
    await vi.waitFor(() => expect(offerCallback).toBeTypeOf("function"));
    const peer = FakePeerConnection.instance;
    expect(peer).toBeDefined();
    if (!peer || !offerCallback) {
      return;
    }

    peer.onicecandidate?.({
      candidate: {
        candidate: "candidate:late 1 udp 1 192.0.2.2 1234 typ host",
        toJSON: () => ({
          candidate: "candidate:late 1 udp 1 192.0.2.2 1234 typ host",
        }),
      },
    } as unknown as RTCPeerConnectionIceEvent);
    offerCallback({
      type: "candidate",
      candidate: { candidate: "remote-candidate" },
    });
    offerCallback({
      type: "session",
      session_id: "session-1",
      signaling_path: "frigate:trickle_ice",
      signaling_fallback_reason: null,
    });
    offerCallback({ type: "answer", answer: "watchzone-answer" });
    await vi.waitFor(() =>
      expect(peer.setRemoteDescription).toHaveBeenCalled(),
    );
    const track = new FakeTrack();
    peer.ontrack?.({ track } as unknown as RTCTrackEvent);
    const connection = await connecting;

    expect(peer.configuration).toEqual({ iceServers: [] });
    expect(peer.createDataChannel).toHaveBeenCalledWith("camera");
    expect(peer.addTransceiver).toHaveBeenCalledWith("audio", {
      direction: "recvonly",
    });
    expect(peer.addTransceiver).toHaveBeenCalledWith("video", {
      direction: "recvonly",
    });
    expect(api.subscribeMessage).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        type: "watchzone/live/webrtc/offer",
        entity_id: "camera.front",
        offer:
          "watchzone-offer\r\na=candidate:early 1 udp 1 192.0.2.1 1234 typ host\r\n",
      }),
    );
    expect(callWS).toHaveBeenCalledWith({
      type: "watchzone/live/webrtc/candidate",
      entity_id: "camera.front",
      session_id: "session-1",
      candidate: {
        candidate: "candidate:late 1 udp 1 192.0.2.2 1234 typ host",
      },
    });
    expect(callWS).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "watchzone/live/webrtc/candidate",
        candidate: expect.objectContaining({
          candidate: expect.stringContaining("candidate:early"),
        }),
      }),
    );
    expect(peer.addIceCandidate).toHaveBeenCalledWith({
      candidate: "remote-candidate",
    });
    expect(connection.stream?.getTracks()).toHaveLength(1);
    expect(timing.snapshot().phases).toMatchObject({
      answer_received: expect.any(Number),
      client_config_received: expect.any(Number),
      first_local_candidate: expect.any(Number),
      first_remote_candidate: expect.any(Number),
      local_description_set: expect.any(Number),
      offer_created: expect.any(Number),
      peer_created: expect.any(Number),
      remote_description_set: expect.any(Number),
      session_received: expect.any(Number),
      signaling_started: expect.any(Number),
      video_track_received: expect.any(Number),
    });
    expect(timing.snapshot().signalingPath).toBe("frigate:trickle_ice");
    expect(timing.snapshot().signalingFallbackReason).toBeUndefined();
    expect(onFailure).not.toHaveBeenCalled();

    vi.useFakeTimers();
    peer.connectionState = "disconnected";
    peer.onconnectionstatechange?.();
    expect(onFailure).not.toHaveBeenCalled();
    peer.connectionState = "connected";
    peer.onconnectionstatechange?.();
    await vi.runAllTimersAsync();
    expect(onFailure).not.toHaveBeenCalled();

    peer.connectionState = "disconnected";
    peer.onconnectionstatechange?.();
    await vi.runOnlyPendingTimersAsync();
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "peer_failed",
        message: "WebRTC connection remained disconnected",
      }),
    );
    onFailure.mockClear();
    vi.useRealTimers();

    offerCallback({ type: "error", message: "camera connection lost" });
    await vi.waitFor(() =>
      expect(onFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "signaling_failed",
          message: "camera connection lost",
        }),
      ),
    );

    onFailure.mockClear();
    const replacementTrack = new FakeTrack("replacement-video-track");
    peer.ontrack?.({ track: replacementTrack } as unknown as RTCTrackEvent);
    track.end();
    expect(onFailure).not.toHaveBeenCalled();
    replacementTrack.end();
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "track_ended",
        message: "WebRTC video track ended",
      }),
    );

    connection.close();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(peer.close).toHaveBeenCalledOnce();
  });

  it("rejects a peer failure before the first track without waiting for timeout", async () => {
    let offerCallback: ((event: unknown) => void) | undefined;
    const callWS = vi.fn(async () => ({
      configuration: { iceServers: [] },
    }));
    const api: HomeAssistantApi = {
      identity: {} as HomeAssistantApi["identity"],
      callWS: callWS as HomeAssistantApi["callWS"],
      resolveUrl: (path) => path,
      subscribeMessage: vi.fn(async (callback) => {
        offerCallback = callback as (event: unknown) => void;
        return vi.fn();
      }),
    };
    const connecting = createHomeAssistantWebRtcConnection(
      api,
      "camera.front",
      new AbortController().signal,
      vi.fn(),
      new LiveStartupTiming("home_assistant:camera.front"),
    );
    await vi.waitFor(() => expect(offerCallback).toBeTypeOf("function"));
    const peer = FakePeerConnection.instance;
    expect(peer).toBeDefined();
    if (!peer) return;

    peer.connectionState = "failed";
    peer.onconnectionstatechange?.();

    await expect(connecting).rejects.toMatchObject({
      code: "peer_failed",
      message: "WebRTC connection failed",
    });
    expect(peer.close).toHaveBeenCalledOnce();
  });
});
