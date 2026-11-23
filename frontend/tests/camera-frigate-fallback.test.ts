import { afterEach, describe, expect, it, vi } from "vitest";

import type { FrigateGo2RtcLiveSourceDescriptor } from "../src/api/live-source";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type {
  MediaSessionLease,
  MediaSessionSnapshot,
} from "../src/core/media-session-manager";
import { CameraLiveSessionController } from "../src/stage/camera-presentation/live/session.controller";
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

function liveLease(
  key: string,
  snapshot: MediaSessionSnapshot,
): MediaSessionLease {
  return {
    key,
    discard: vi.fn(),
    getSnapshot: () => snapshot,
    markUsable: vi.fn(),
    release: vi.fn(),
    retry: vi.fn(),
    subscribe: vi.fn((listener) => {
      listener(snapshot);
      return () => undefined;
    }),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

describe("Frigate fallback selection", () => {
  it("closes a losing MSE fallback after WebRTC takeover", async () => {
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
    const webRtcVideo = document.createElement("video");
    const webRtcLease = liveLease("frigate_go2rtc:camera.front:main:webrtc", {
      state: "live",
      stream: { getTracks: () => [] } as unknown as MediaStream,
      transport: "webrtc",
      video: webRtcVideo,
    });
    const mseLease = liveLease(`${source.id}:mse`, {
      state: "live",
      transport: "mse",
      video: document.createElement("video"),
    });
    vi.spyOn(LiveSourceResolver.prototype, "cachedFrigate").mockReturnValue(
      source,
    );
    vi.spyOn(
      LiveSourceResolver.prototype,
      "acquireUsableFrigateWebRtc",
    ).mockReturnValue(undefined);
    vi.spyOn(
      LiveSourceResolver.prototype,
      "acquireFrigateWebRtc",
    ).mockResolvedValue(webRtcLease);
    vi.spyOn(
      LiveSourceResolver.prototype,
      "acquireUsableFrigateMse",
    ).mockReturnValue(mseLease);
    const controller = new CameraLiveSessionController(
      {
        addController: vi.fn(),
        removeController: vi.fn(),
        requestUpdate: vi.fn(),
        updateComplete: Promise.resolve(true),
      },
      {
        getInitialMuted: () => true,
        onActiveVideoChanged: vi.fn(),
      },
    );

    controller.hostConnected();
    controller.configure(api, "camera.front", true, "frigate_go2rtc");
    await vi.waitFor(() => expect(controller.webRtcVideo).toBe(webRtcVideo));
    expect(controller.selected).toBe("fallback");

    controller.handleWebRtcDecoded(webRtcVideo);
    expect(controller.selected).toBe("webrtc");
    controller.handleWebRtcPresented();

    expect(mseLease.discard).toHaveBeenCalledOnce();
    expect(mseLease.release).not.toHaveBeenCalled();
    controller.hostDisconnected();
  });

  it.each(["home_assistant", "frigate_go2rtc"] as const)(
    "starts %s HLS immediately after a long-hidden retained WebRTC presentation returns",
    async (connection) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-23T02:00:00Z"));
      const api = {
        identity: {},
        callWS: vi.fn(),
        resolveUrl: (path: string) => path,
        subscribeMessage: vi.fn(),
      } as unknown as HomeAssistantApi;
      const stream = { getTracks: () => [] } as unknown as MediaStream;
      const webRtcVideo = document.createElement("video");
      let deliverFreshWebRtcFrame: (() => void) | undefined;
      webRtcVideo.requestVideoFrameCallback = vi.fn((callback) => {
        deliverFreshWebRtcFrame = () =>
          callback(0, {} as VideoFrameCallbackMetadata);
        return 1;
      });
      webRtcVideo.cancelVideoFrameCallback = vi.fn();
      webRtcVideo.play = vi.fn(() => Promise.resolve());
      const webRtcLease = liveLease(
        connection === "home_assistant"
          ? "home_assistant:webrtc:camera.front"
          : "frigate_go2rtc:camera.front:main:webrtc",
        {
          state: "live",
          stream,
          transport: "webrtc",
          usable: true,
          video: webRtcVideo,
        },
      );
      const hlsVideo = document.createElement("video");
      const hlsLease = liveLease(
        connection === "home_assistant"
          ? "home_assistant:hls:camera.front"
          : "frigate_go2rtc:camera.front:main:hls",
        {
          state: "live",
          transport: "hls_mse",
          video: hlsVideo,
        },
      );
      const source: FrigateGo2RtcLiveSourceDescriptor = {
        id: "frigate_go2rtc:entry-home:front",
        type: "frigate_go2rtc",
        frigate_instance_id: "frigate",
        stream_name: "front",
      };
      vi.spyOn(LiveSourceResolver.prototype, "cachedFrigate").mockReturnValue(
        source,
      );
      vi.spyOn(
        LiveSourceResolver.prototype,
        "acquireUsableHomeAssistantWebRtc",
      ).mockReturnValue(
        connection === "home_assistant" ? webRtcLease : undefined,
      );
      vi.spyOn(
        LiveSourceResolver.prototype,
        "acquireUsableFrigateWebRtc",
      ).mockReturnValue(
        connection === "frigate_go2rtc" ? webRtcLease : undefined,
      );
      vi.spyOn(
        LiveSourceResolver.prototype,
        "acquireUsableFrigateHls",
      ).mockReturnValue(undefined);
      const acquireHomeAssistantHls = vi
        .spyOn(LiveSourceResolver.prototype, "acquireHomeAssistantHls")
        .mockResolvedValue(hlsLease);
      const acquireFrigateHls = vi
        .spyOn(LiveSourceResolver.prototype, "acquireFrigateHls")
        .mockResolvedValue(hlsLease);
      const controller = new CameraLiveSessionController(
        {
          addController: vi.fn(),
          removeController: vi.fn(),
          requestUpdate: vi.fn(),
          updateComplete: Promise.resolve(true),
        },
        {
          getInitialMuted: () => true,
          onActiveVideoChanged: vi.fn(),
        },
      );

      controller.hostConnected();
      controller.configure(api, "camera.front", true, connection, true, "hls");
      expect(controller.selected).toBe("webrtc");

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(119_999);
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
      expect(acquireHomeAssistantHls).not.toHaveBeenCalled();
      expect(acquireFrigateHls).not.toHaveBeenCalled();
      expect(controller.selected).toBe("webrtc");

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(120_000);
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);

      if (connection === "home_assistant") {
        expect(acquireHomeAssistantHls).toHaveBeenCalledOnce();
        expect(acquireFrigateHls).not.toHaveBeenCalled();
      } else {
        expect(acquireFrigateHls).toHaveBeenCalledOnce();
        expect(acquireHomeAssistantHls).not.toHaveBeenCalled();
      }
      expect(controller.selected).toBe("fallback");

      deliverFreshWebRtcFrame?.();
      expect(controller.selected).toBe("webrtc");
      controller.handleWebRtcPresented();
      expect(hlsLease.discard).toHaveBeenCalledOnce();
      controller.hostDisconnected();
    },
  );

  it("starts WebRTC without waiting for Frigate source discovery", () => {
    const api = {
      identity: {},
      callWS: vi.fn(),
      resolveUrl: (path: string) => path,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    vi.spyOn(LiveSourceResolver.prototype, "cachedFrigate").mockReturnValue(
      undefined,
    );
    const resolveSource = vi
      .spyOn(LiveSourceResolver.prototype, "resolveFrigate")
      .mockReturnValue(new Promise(() => undefined));
    const acquireWebRtc = vi
      .spyOn(LiveSourceResolver.prototype, "acquireUsableFrigateWebRtc")
      .mockReturnValue(lease("frigate_go2rtc:camera.front:front_sub:webrtc"));
    const controller = new CameraLiveSessionController(
      {
        addController: vi.fn(),
        removeController: vi.fn(),
        requestUpdate: vi.fn(),
        updateComplete: Promise.resolve(true),
      },
      {
        getInitialMuted: () => true,
        onActiveVideoChanged: vi.fn(),
      },
    );

    controller.hostConnected();
    controller.configure(
      api,
      "camera.front",
      true,
      "frigate_go2rtc",
      true,
      "mse",
      true,
      false,
      "front_sub",
    );

    expect(resolveSource).toHaveBeenCalledWith(
      api,
      "camera.front",
      "front_sub",
    );
    expect(acquireWebRtc).toHaveBeenCalledWith(
      api,
      "camera.front",
      "front_sub",
    );
  });

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
    ).mockReturnValue(lease("frigate_go2rtc:camera.front:main:webrtc"));
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

  it("discards preview-owned sessions when the preview disconnects", async () => {
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
    const previewLease = lease("frigate_go2rtc:camera.front:main:webrtc");
    vi.spyOn(LiveSourceResolver.prototype, "cachedFrigate").mockReturnValue(
      source,
    );
    vi.spyOn(
      LiveSourceResolver.prototype,
      "acquireUsableFrigateWebRtc",
    ).mockReturnValue(previewLease);
    const controller = new CameraLiveSessionController(
      {
        addController: vi.fn(),
        removeController: vi.fn(),
        requestUpdate: vi.fn(),
        updateComplete: Promise.resolve(true),
      },
      {
        getInitialMuted: () => true,
        onActiveVideoChanged: vi.fn(),
      },
    );

    controller.hostConnected();
    controller.configure(
      api,
      "camera.front",
      true,
      "frigate_go2rtc",
      true,
      "mse",
      true,
      true,
    );
    controller.hostDisconnected();
    await Promise.resolve();

    expect(previewLease.discard).toHaveBeenCalledOnce();
    expect(previewLease.release).not.toHaveBeenCalled();
  });

  it("keeps the same preview lease across a synchronous host reparent", async () => {
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
    const retainedLease = lease("frigate_go2rtc:camera.front:main:webrtc");
    vi.spyOn(LiveSourceResolver.prototype, "cachedFrigate").mockReturnValue(
      source,
    );
    vi.spyOn(
      LiveSourceResolver.prototype,
      "acquireUsableFrigateWebRtc",
    ).mockReturnValue(retainedLease);
    const controller = new CameraLiveSessionController(
      {
        addController: vi.fn(),
        removeController: vi.fn(),
        requestUpdate: vi.fn(),
        updateComplete: Promise.resolve(true),
      },
      {
        getInitialMuted: () => true,
        onActiveVideoChanged: vi.fn(),
      },
    );

    controller.hostConnected();
    controller.configure(
      api,
      "camera.front",
      true,
      "frigate_go2rtc",
      true,
      "mse",
      true,
      true,
    );
    controller.hostDisconnected();
    controller.hostConnected();
    await Promise.resolve();

    expect(retainedLease.discard).not.toHaveBeenCalled();
    expect(retainedLease.release).not.toHaveBeenCalled();
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
    expect(acquireHls).toHaveBeenCalledWith(api, "camera.front", undefined, {
      initialMuted: true,
      lowLatencyHls: true,
      nativeHlsOnly: true,
    });
    expect(acquireMse).not.toHaveBeenCalled();
    expect(acquireWebRtc).not.toHaveBeenCalled();
    expect(controller.effectiveLowLatencyHls).toBe(true);
  });
});
