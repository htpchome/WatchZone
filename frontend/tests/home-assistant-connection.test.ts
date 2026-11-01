import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHomeAssistantWebRtcConnection } from "../src/connections/home-assistant";
import type { HomeAssistantApi } from "../src/core/home-assistant";

class FakeTrack {
  public readonly id = "video-track";
  public readonly kind = "video";
  public readonly stop = vi.fn();
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
    globalThis.MediaStream = originalMediaStream;
    globalThis.RTCPeerConnection = originalPeerConnection;
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
      subscribeMessage: vi.fn(async (callback) => {
        offerCallback = callback as (event: unknown) => void;
        return unsubscribe;
      }),
    };
    const onFailure = vi.fn();

    const connecting = createHomeAssistantWebRtcConnection(
      api,
      "camera.front",
      new AbortController().signal,
      onFailure,
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
    offerCallback({ type: "session", session_id: "session-1" });
    offerCallback({ type: "answer", answer: "watchzone-answer" });
    await vi.waitFor(() =>
      expect(peer.setRemoteDescription).toHaveBeenCalled(),
    );
    peer.ontrack?.({ track: new FakeTrack() } as unknown as RTCTrackEvent);
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
        type: "camera/webrtc/offer",
        entity_id: "camera.front",
        offer:
          "watchzone-offer\r\na=candidate:early 1 udp 1 192.0.2.1 1234 typ host\r\n",
      }),
    );
    expect(callWS).toHaveBeenCalledWith({
      type: "camera/webrtc/candidate",
      entity_id: "camera.front",
      session_id: "session-1",
      candidate: {
        candidate: "candidate:late 1 udp 1 192.0.2.2 1234 typ host",
      },
    });
    expect(callWS).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "camera/webrtc/candidate",
        candidate: expect.objectContaining({
          candidate: expect.stringContaining("candidate:early"),
        }),
      }),
    );
    expect(peer.addIceCandidate).toHaveBeenCalledWith({
      candidate: "remote-candidate",
    });
    expect(connection.stream.getTracks()).toHaveLength(1);
    expect(onFailure).not.toHaveBeenCalled();

    offerCallback({ type: "error", message: "camera connection lost" });
    await vi.waitFor(() =>
      expect(onFailure).toHaveBeenCalledWith(
        new Error("camera connection lost"),
      ),
    );

    connection.close();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(peer.close).toHaveBeenCalledOnce();
  });
});
