import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { MediaSessionSnapshot } from "../src/core/media-session-manager";
import { getMediaSessionManager } from "../src/core/media-session-manager";

const provider = vi.hoisted(() => ({
  acquireMse: vi.fn(),
  acquireWebRtc: vi.fn(),
}));

vi.mock("../src/providers/frigate/live", () => ({
  FrigateLiveProvider: class {
    public acquireMse = provider.acquireMse;
    public acquireWebRtc = provider.acquireWebRtc;
  },
}));

import { FrigateCameraLiveSessionController } from "../src/providers/frigate/live/session.controller";

describe("Frigate live session selection", () => {
  beforeEach(() => {
    provider.acquireMse.mockReset();
    provider.acquireWebRtc.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts MSE and WebRTC together, then upgrades without a second session", async () => {
    const mse = lease();
    const webRtc = lease();
    provider.acquireMse.mockResolvedValue(mse.value);
    provider.acquireWebRtc.mockResolvedValue(webRtc.value);
    const activeVideoChanged = vi.fn();
    const controller = new FrigateCameraLiveSessionController(new Host(), {
      getInitialMuted: () => true,
      onActiveVideoChanged: activeVideoChanged,
    });

    controller.configure(api(), "camera.front", true);
    controller.connect();
    await vi.waitFor(() => {
      expect(provider.acquireMse).toHaveBeenCalledOnce();
      expect(provider.acquireWebRtc).toHaveBeenCalledOnce();
    });

    const mseVideo = document.createElement("video");
    mse.publish({ state: "live", transport: "mse", video: mseVideo });
    expect(controller.selected).toBe("mse");
    expect(activeVideoChanged).toHaveBeenLastCalledWith(mseVideo);

    const webRtcStream = {} as MediaStream;
    webRtc.publish({
      state: "live",
      stream: webRtcStream,
      transport: "webrtc",
    });
    const webRtcVideo = document.createElement("video");
    controller.handleWebRtcDecoded(webRtcVideo);
    expect(controller.selected).toBe("webrtc");
    expect(controller.webRtcStream).toBe(webRtcStream);
    expect(activeVideoChanged).toHaveBeenLastCalledWith(webRtcVideo);

    controller.handleWebRtcPresented();
    expect(mse.value.discard).toHaveBeenCalledOnce();
    expect(provider.acquireMse).toHaveBeenCalledOnce();
    expect(provider.acquireWebRtc).toHaveBeenCalledOnce();
  });

  it("reattaches retained WebRTC without painting a new MSE fallback", async () => {
    vi.spyOn(
      getMediaSessionManager(),
      "hasReusableTransport",
    ).mockReturnValue(true);
    const webRtc = lease();
    provider.acquireWebRtc.mockResolvedValue(webRtc.value);
    const activeVideoChanged = vi.fn();
    const controller = new FrigateCameraLiveSessionController(new Host(), {
      getInitialMuted: () => true,
      onActiveVideoChanged: activeVideoChanged,
    });

    controller.configure(api(), "camera.front", true);
    controller.connect();
    await vi.waitFor(() => {
      expect(provider.acquireWebRtc).toHaveBeenCalledOnce();
    });

    expect(provider.acquireMse).not.toHaveBeenCalled();
    const stream = {} as MediaStream;
    webRtc.publish({ state: "live", stream, transport: "webrtc" });
    const video = document.createElement("video");
    controller.handleWebRtcDecoded(video);
    expect(controller.selected).toBe("webrtc");
    expect(activeVideoChanged).toHaveBeenLastCalledWith(video);
  });
});

class Host {
  public readonly updateComplete = Promise.resolve(true);
  public addController = vi.fn();
  public removeController = vi.fn();
  public requestUpdate = vi.fn();
}

function api(): HomeAssistantApi {
  return {
    identity: { subscribeMessage: vi.fn() },
    callWS: vi.fn(),
    resolveUrl: (path) => path,
    subscribeMessage: vi.fn(),
  };
}

function lease() {
  let publishSnapshot: ((snapshot: MediaSessionSnapshot) => void) | undefined;
  return {
    publish(snapshot: MediaSessionSnapshot): void {
      publishSnapshot?.(snapshot);
    },
    value: {
      discard: vi.fn(),
      release: vi.fn(),
      subscribe: vi.fn((callback: (snapshot: MediaSessionSnapshot) => void) => {
        publishSnapshot = callback;
        return vi.fn();
      }),
    },
  };
}
