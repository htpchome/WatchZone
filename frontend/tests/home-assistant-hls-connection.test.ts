import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHomeAssistantHlsConnection } from "../src/connections/home-assistant/hls";
import { createHomeAssistantCatalystHlsConnection } from "../src/connections/home-assistant/catalyst-hls";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import { LiveStartupTiming } from "../src/core/live-startup-timing";

const hlsMock = vi.hoisted(() => ({
  attachMedia: vi.fn(),
  destroy: vi.fn(),
  isSupported: vi.fn(),
  loadSource: vi.fn(),
  on: vi.fn(),
}));

vi.mock("hls.js/dist/hls.light.mjs", () => ({
  default: class FakeHls {
    public static readonly Events = { ERROR: "error" };
    public static isSupported(): boolean {
      return hlsMock.isSupported();
    }

    public readonly attachMedia = hlsMock.attachMedia;
    public readonly destroy = hlsMock.destroy;
    public readonly loadSource = hlsMock.loadSource;
    public readonly on = hlsMock.on;
  },
}));

describe("Home Assistant HLS connection", () => {
  beforeEach(() => {
    for (const mock of Object.values(hlsMock)) {
      mock.mockReset();
    }
    hlsMock.isSupported.mockReturnValue(true);
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue(
      "maybe",
    );
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(
      () => undefined,
    );
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(
      () => undefined,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests an authenticated HLS stream and resolves on decoded media", async () => {
    hlsMock.isSupported.mockReturnValue(false);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("#EXTM3U\n#EXT-X-VERSION:3\n"),
    );
    const callWS = vi.fn(async () => ({ url: "/api/hls/front.m3u8" }));
    const api: HomeAssistantApi = {
      identity: {} as HomeAssistantApi["identity"],
      callWS: callWS as HomeAssistantApi["callWS"],
      resolveUrl: (path) => `https://ha.example${path}`,
      subscribeMessage: vi.fn(),
    };
    const timing = new LiveStartupTiming("home_assistant_hls:camera.front");
    const connecting = createHomeAssistantHlsConnection(
      api,
      "camera.front",
      new AbortController().signal,
      vi.fn(),
      timing,
    );

    await vi.waitFor(() =>
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled(),
    );
    const video = vi
      .mocked(HTMLMediaElement.prototype.play)
      .mock.contexts.find(
        (context): context is HTMLVideoElement =>
          context instanceof HTMLVideoElement,
      );
    expect(video).toBeDefined();
    video?.dispatchEvent(new Event("loadeddata"));
    const connection = await connecting;

    expect(callWS).toHaveBeenCalledWith({
      type: "camera/stream",
      entity_id: "camera.front",
      format: "hls",
    });
    expect(connection.video).toBe(video);
    expect(connection.transport).toBe("hls_native");
    expect(video?.src).toBe("https://ha.example/api/hls/front.m3u8");
    expect(timing.snapshot().phases).toMatchObject({
      first_frame_decoded: expect.any(Number),
      hls_manifest_loaded: expect.any(Number),
      hls_native_path_selected: expect.any(Number),
      stream_url_received: expect.any(Number),
      stream_url_requested: expect.any(Number),
    });

    connection.close();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("loads one HLS variant directly through the lazy playback engine", async () => {
    vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue("");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nmedia/stream.m3u8\n",
      ),
    );
    const callWS = vi.fn(async () => ({ url: "/api/hls/master.m3u8" }));
    const api: HomeAssistantApi = {
      identity: {} as HomeAssistantApi["identity"],
      callWS: callWS as HomeAssistantApi["callWS"],
      resolveUrl: (path) => `https://ha.example${path}`,
      subscribeMessage: vi.fn(),
    };
    const timing = new LiveStartupTiming("home_assistant_hls:camera.front");
    const connecting = createHomeAssistantHlsConnection(
      api,
      "camera.front",
      new AbortController().signal,
      vi.fn(),
      timing,
    );

    await vi.waitFor(() => expect(hlsMock.attachMedia).toHaveBeenCalled());
    const video = hlsMock.attachMedia.mock.calls[0][0] as HTMLVideoElement;
    video.dispatchEvent(new Event("loadeddata"));
    const connection = await connecting;

    expect(fetch).toHaveBeenCalledWith(
      "https://ha.example/api/hls/master.m3u8",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(hlsMock.loadSource).toHaveBeenCalledWith(
      "https://ha.example/api/hls/media/stream.m3u8",
    );
    expect(connection.transport).toBe("hls_mse");
    expect(timing.snapshot().phases).toMatchObject({
      hls_engine_loaded: expect.any(Number),
      hls_manifest_loaded: expect.any(Number),
      hls_mse_path_selected: expect.any(Number),
    });

    connection.close();
    expect(hlsMock.destroy).toHaveBeenCalledOnce();
  });

  it("primes an unmuted visible candidate before requesting its source", async () => {
    hlsMock.isSupported.mockReturnValue(false);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("#EXTM3U\n#EXT-X-VERSION:3\n"),
    );
    let resolveStream: ((value: { url: string }) => void) | undefined;
    const streamResponse = new Promise<{ url: string }>((resolve) => {
      resolveStream = resolve;
    });
    const callWS = vi.fn(() => streamResponse);
    const api: HomeAssistantApi = {
      identity: {} as HomeAssistantApi["identity"],
      callWS: callWS as HomeAssistantApi["callWS"],
      resolveUrl: (path) => `https://ha.example${path}`,
      subscribeMessage: vi.fn(),
    };
    let attachedMuteState:
      { defaultMuted: boolean; muted: boolean } | undefined;
    const onVideo = vi.fn((video: HTMLVideoElement) => {
      attachedMuteState = {
        defaultMuted: video.defaultMuted,
        muted: video.muted,
      };
      document.body.append(video);
    });
    const timing = new LiveStartupTiming("home_assistant_hls:camera.front");
    const connecting = createHomeAssistantHlsConnection(
      api,
      "camera.front",
      new AbortController().signal,
      vi.fn(),
      timing,
      { initialMuted: false, onVideo },
    );

    expect(onVideo).toHaveBeenCalledOnce();
    const video = onVideo.mock.calls[0][0];
    expect(attachedMuteState).toEqual({ defaultMuted: true, muted: true });
    expect(video.isConnected).toBe(true);
    expect(video.muted).toBe(false);
    expect(video.defaultMuted).toBe(false);
    expect(video.playsInline).toBe(true);
    expect(video.hasAttribute("webkit-playsinline")).toBe(true);
    await vi.waitFor(() =>
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce(),
    );
    expect(callWS).toHaveBeenCalledOnce();
    expect(video.src).toBe("");

    resolveStream?.({ url: "/api/hls/front.m3u8" });
    await vi.waitFor(() => expect(video.src).not.toBe(""));
    video.dispatchEvent(new Event("loadeddata"));
    const connection = await connecting;
    connection.close();
  });

  it("uses native HLS without loading HLS.js for Catalyst policy", async () => {
    const playbackStates: Array<{
      defaultMuted: boolean;
      muted: boolean;
      src: string;
      volume: number;
    }> = [];
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      playbackStates.push({
        defaultMuted: this.defaultMuted,
        muted: this.muted,
        src: this.getAttribute("src") ?? "",
        volume: this.volume,
      });
      return Promise.resolve();
    });
    const fetchManifest = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("#EXTM3U\n#EXT-X-VERSION:3\n"));
    const api: HomeAssistantApi = {
      identity: {} as HomeAssistantApi["identity"],
      callWS: vi.fn(async () => ({
        url: "/api/hls/front.m3u8",
      })) as HomeAssistantApi["callWS"],
      resolveUrl: (path) => `https://ha.example${path}`,
      subscribeMessage: vi.fn(),
    };
    const timing = new LiveStartupTiming(
      "home_assistant_catalyst_hls:camera.front",
    );
    let attachedState:
      { autoplay: boolean; defaultMuted: boolean; muted: boolean } | undefined;
    const onVideo = vi.fn((video: HTMLVideoElement) => {
      attachedState = {
        autoplay: video.autoplay,
        defaultMuted: video.defaultMuted,
        muted: video.muted,
      };
      document.body.append(video);
    });
    const connecting = createHomeAssistantCatalystHlsConnection(
      api,
      "camera.front",
      new AbortController().signal,
      vi.fn(),
      timing,
      { initialMuted: false, onVideo },
    );

    expect(onVideo).toHaveBeenCalledOnce();
    const video = onVideo.mock.calls[0][0];
    expect(attachedState).toEqual({
      autoplay: true,
      defaultMuted: false,
      muted: true,
    });
    expect(video.isConnected).toBe(true);
    expect(video.defaultMuted).toBe(false);
    expect(video.muted).toBe(false);
    await vi.waitFor(() => expect(playbackStates[0]?.src).toBe(""));
    await vi.waitFor(() => expect(video.src).not.toBe(""));
    await vi.waitFor(() =>
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2),
    );
    expect(video.src).toBe("https://ha.example/api/hls/front.m3u8");
    expect(fetchManifest).not.toHaveBeenCalled();
    video.dispatchEvent(new Event("loadeddata"));
    const connection = await connecting;

    expect(connection.transport).toBe("hls_native");
    expect(hlsMock.isSupported).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(3);
    expect(playbackStates).toEqual([
      { defaultMuted: false, muted: false, src: "", volume: 1 },
      {
        defaultMuted: false,
        muted: false,
        src: "https://ha.example/api/hls/front.m3u8",
        volume: 1,
      },
      {
        defaultMuted: false,
        muted: false,
        src: "https://ha.example/api/hls/front.m3u8",
        volume: 1,
      },
    ]);
    expect(video.muted).toBe(false);
    expect(timing.snapshot().phases).not.toHaveProperty("hls_engine_loaded");
    expect(timing.snapshot().phases).not.toHaveProperty("hls_manifest_loaded");
    connection.close();
  });
});
