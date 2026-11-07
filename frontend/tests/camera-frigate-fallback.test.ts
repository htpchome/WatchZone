import { afterEach, describe, expect, it, vi } from "vitest";

import type { FrigateGo2RtcLiveSourceDescriptor } from "../src/api/live-source";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { MediaSessionLease } from "../src/core/media-session-manager";
import { CameraLiveSessionController } from "../src/modules/camera/live/session.controller";
import { LiveSourceResolver } from "../src/providers/live-source-resolver";

function lease(key: string): MediaSessionLease {
  return {
    key,
    discard: vi.fn(),
    getSnapshot: () => ({ state: "new" }),
    markUsable: vi.fn(),
    release: vi.fn(),
    retry: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("Frigate fallback selection", () => {
  it("acquires HLS without also acquiring MSE", () => {
    const source: FrigateGo2RtcLiveSourceDescriptor = {
      id: "frigate_go2rtc:entry-home:front",
      type: "frigate_go2rtc",
      frigate_instance_id: "frigate",
      stream_name: "front",
    };
    const api = {
      identity: {},
      callWS: vi.fn(),
      resolveUrl: (path: string) => path,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    vi.spyOn(LiveSourceResolver.prototype, "cachedFrigate").mockReturnValue(
      source,
    );
    vi.spyOn(
      LiveSourceResolver.prototype,
      "acquireUsableFrigateWebRtc",
    ).mockReturnValue(lease(`${source.id}:webrtc`));
    const acquireHls = vi
      .spyOn(LiveSourceResolver.prototype, "acquireUsableFrigateHls")
      .mockReturnValue(lease(`${source.id}:hls`));
    const acquireMse = vi.spyOn(
      LiveSourceResolver.prototype,
      "acquireUsableFrigateMse",
    );
    const host = {
      addController: vi.fn(),
      removeController: vi.fn(),
      requestUpdate: vi.fn(),
      updateComplete: Promise.resolve(true),
    };
    const controller = new CameraLiveSessionController(host, {
      getInitialMuted: () => true,
      onActiveVideoChanged: vi.fn(),
    });

    controller.hostConnected();
    controller.configure(
      api,
      "camera.front",
      true,
      "frigate_go2rtc",
      true,
      "hls",
    );

    expect(acquireHls).toHaveBeenCalledOnce();
    expect(acquireMse).not.toHaveBeenCalled();
  });

  it("acquires only HLS when the client policy requires it", () => {
    const source: FrigateGo2RtcLiveSourceDescriptor = {
      id: "frigate_go2rtc:entry-home:front",
      type: "frigate_go2rtc",
      frigate_instance_id: "frigate",
      stream_name: "front",
    };
    const api = {
      identity: {},
      callWS: vi.fn(),
      resolveUrl: (path: string) => path,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    vi.spyOn(LiveSourceResolver.prototype, "cachedFrigate").mockReturnValue(
      source,
    );
    vi.spyOn(
      LiveSourceResolver.prototype,
      "frigateTransportPolicy",
    ).mockReturnValue({ fallback: "hls", hlsOnly: true });
    const acquireHls = vi
      .spyOn(LiveSourceResolver.prototype, "acquireUsableFrigateHls")
      .mockReturnValue(lease(`${source.id}:hls`));
    const acquireMse = vi.spyOn(
      LiveSourceResolver.prototype,
      "acquireUsableFrigateMse",
    );
    const acquireWebRtc = vi.spyOn(
      LiveSourceResolver.prototype,
      "acquireUsableFrigateWebRtc",
    );
    const host = {
      addController: vi.fn(),
      removeController: vi.fn(),
      requestUpdate: vi.fn(),
      updateComplete: Promise.resolve(true),
    };
    const controller = new CameraLiveSessionController(host, {
      getInitialMuted: () => true,
      onActiveVideoChanged: vi.fn(),
    });

    controller.hostConnected();
    controller.configure(
      api,
      "camera.front",
      true,
      "frigate_go2rtc",
      true,
      "mse",
    );

    expect(acquireHls).toHaveBeenCalledOnce();
    expect(acquireHls).toHaveBeenCalledWith(api, source, {
      initialMuted: true,
      lowLatencyHls: true,
      nativeHlsOnly: true,
    });
    expect(acquireMse).not.toHaveBeenCalled();
    expect(acquireWebRtc).not.toHaveBeenCalled();
    expect(controller.effectiveLowLatencyHls).toBe(true);
  });
});
