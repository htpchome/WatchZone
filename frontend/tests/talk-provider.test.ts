import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";

const mocks = vi.hoisted(() => ({
  createPeer: vi.fn(),
  getTalkCapability: vi.fn(),
  sendTalkCandidate: vi.fn(),
  subscribeTalkOffer: vi.fn(),
}));

vi.mock("../src/api/talk-signaling", () => ({
  getTalkCapability: mocks.getTalkCapability,
  sendTalkCandidate: mocks.sendTalkCandidate,
  subscribeTalkOffer: mocks.subscribeTalkOffer,
}));

vi.mock("../src/core/webrtc-peer-connection", () => ({
  createWebRtcTalkPeerConnection: mocks.createPeer,
}));

import { HomeAssistantTalkProvider } from "../src/providers/home-assistant/talk";

describe("Home Assistant two-way-talk provider", () => {
  const stop = vi.fn();
  const track = { enabled: true, stop } as unknown as MediaStreamTrack;
  const stream = {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;

  beforeEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    mocks.subscribeTalkOffer.mockResolvedValue(() => undefined);
    mocks.sendTalkCandidate.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    track.enabled = true;
  });

  it("trusts Home Assistant's native two-way-audio capability", async () => {
    mocks.getTalkCapability.mockResolvedValue(true);

    await expect(
      new HomeAssistantTalkProvider().supports(api(), "camera.front"),
    ).resolves.toBe(true);

    expect(mocks.subscribeTalkOffer).not.toHaveBeenCalled();
  });

  it("rejects cameras without native support or a WebRTC probe path", async () => {
    mocks.getTalkCapability.mockResolvedValue(false);

    await expect(
      new HomeAssistantTalkProvider().supports(api(), "camera.front"),
    ).resolves.toBe(false);

    expect(mocks.subscribeTalkOffer).not.toHaveBeenCalled();
  });

  it("retries accelerated signaling once through standard Home Assistant", async () => {
    const forceStandard: boolean[] = [];
    const close = vi.fn();
    mocks.subscribeTalkOffer.mockImplementation(
      async (
        _api: HomeAssistantApi,
        _entityId: string,
        _offer: string,
        forced: boolean,
      ) => {
        forceStandard.push(forced);
        return () => undefined;
      },
    );
    mocks.createPeer
      .mockImplementationOnce(async (options) => {
        options.onSignalingPath("frigate:trickle_ice");
        await options.signaling.subscribe("offer", vi.fn());
        throw new Error("accelerated path failed");
      })
      .mockImplementationOnce(async (options) => {
        options.onSignalingPath("home_assistant:standard");
        await options.signaling.subscribe("offer", vi.fn());
        return { signalingPath: "home_assistant:standard", close };
      });

    const connection = await new HomeAssistantTalkProvider().connect(
      api(),
      "camera.front",
      new AbortController().signal,
      vi.fn(),
    );

    expect(forceStandard).toEqual([false, true]);
    expect(connection.localStream).toBe(stream);
    connection.setMicrophoneMuted(true);
    expect(track.enabled).toBe(false);
    connection.close();
    expect(close).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("does not layer a retry over a failed standard path", async () => {
    mocks.createPeer.mockImplementationOnce(async (options) => {
      options.onSignalingPath("home_assistant:standard");
      throw new Error("standard path failed");
    });

    await expect(
      new HomeAssistantTalkProvider().connect(
        api(),
        "camera.front",
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow("standard path failed");
    expect(mocks.createPeer).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });
});

function api(): HomeAssistantApi {
  return {
    identity: { subscribeMessage: vi.fn() },
    callWS: vi.fn().mockResolvedValue({ configuration: {} }),
    resolveUrl: (path) => path,
    subscribeMessage: vi.fn(),
  };
}
