import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHomeAssistantHlsConnection } from "../src/providers/home-assistant/live/hls";
import { LiveSourceResolver } from "../src/providers/live-source-resolver";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import { LiveStartupTiming } from "../src/core/live-startup-timing";

const hlsMock = vi.hoisted(() => ({
  attachMedia: vi.fn(),
  construct: vi.fn(),
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

    public constructor(config: unknown) {
      hlsMock.construct(config);
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
    delete (HTMLVideoElement.prototype as Partial<HTMLVideoElement>)
      .requestVideoFrameCallback;
    delete (HTMLVideoElement.prototype as Partial<HTMLVideoElement>)
      .cancelVideoFrameCallback;
  });

  it("uses distinct retained identities for low-latency and standard HLS", () => {
    const resolver = new LiveSourceResolver();
    expect(resolver.homeAssistantHlsKey("camera.front", true)).toBe(
      "home_assistant:hls:camera.front",
    );
    expect(resolver.homeAssistantHlsKey("camera.front", false)).toBe(
      "home_assistant:hls:standard:camera.front",
    );
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
      hls_engine_loaded: expect.any(Number),
      hls_manifest_loaded: expect.any(Number),
      hls_native_path_selected: expect.any(Number),
      stream_url_received: expect.any(Number),
      stream_url_requested: expect.any(Number),
    });

    Object.defineProperties(video as HTMLVideoElement, {
      paused: { configurable: true, value: false },
      readyState: {
        configurable: true,
        value: HTMLMediaElement.HAVE_FUTURE_DATA,
      },
      seekable: {
        configurable: true,
        value: {
          end: () => 60,
          length: 1,
          start: () => 0,
        },
      },
    });
    (video as HTMLVideoElement).currentTime = 20;
    video?.dispatchEvent(new Event("waiting"));
    expect((video as HTMLVideoElement).currentTime).toBe(20);
    expect((video as HTMLVideoElement).playbackRate).toBe(1);

    connection.close();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("waits for a presented native-HLS frame when the browser can report one", async () => {
    hlsMock.isSupported.mockReturnValue(false);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("#EXTM3U\n#EXT-X-VERSION:3\n"),
    );
    const frameCallbacks = new Map<number, VideoFrameRequestCallback>();
    let nextFrame = 1;
    Object.defineProperty(
      HTMLVideoElement.prototype,
      "requestVideoFrameCallback",
      {
        configurable: true,
        value: vi.fn((callback: VideoFrameRequestCallback) => {
          const id = nextFrame++;
          frameCallbacks.set(id, callback);
          return id;
        }),
      },
    );
    Object.defineProperty(
      HTMLVideoElement.prototype,
      "cancelVideoFrameCallback",
      {
        configurable: true,
        value: vi.fn((id: number) => {
          frameCallbacks.delete(id);
        }),
      },
    );
    const callWS = vi.fn(async () => ({ url: "/api/hls/front.m3u8" }));
    const api: HomeAssistantApi = {
      identity: {} as HomeAssistantApi["identity"],
      callWS: callWS as HomeAssistantApi["callWS"],
      resolveUrl: (path) => `https://ha.example${path}`,
      subscribeMessage: vi.fn(),
    };
    let resolved = false;
    const connecting = createHomeAssistantHlsConnection(
      api,
      "camera.front",
      new AbortController().signal,
      vi.fn(),
      new LiveStartupTiming("home_assistant_hls:camera.front"),
    ).then((connection) => {
      resolved = true;
      return connection;
    });

    await vi.waitFor(() =>
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled(),
    );
    const video = vi
      .mocked(HTMLMediaElement.prototype.play)
      .mock.contexts.find(
        (context): context is HTMLVideoElement =>
          context instanceof HTMLVideoElement,
      );
    video?.dispatchEvent(new Event("loadeddata"));
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(frameCallbacks.size).toBe(1);

    const [callback] = frameCallbacks.values();
    callback(performance.now(), {} as VideoFrameCallbackMetadata);
    const connection = await connecting;
    expect(connection.video).toBe(video);
    connection.close();
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

  it("bootstraps Home Assistant LL-HLS without waiting for its master playlist", async () => {
    vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue("");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        '#EXTM3U\n#EXT-X-PART-INF:PART-TARGET=1.000\n#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=2.000\n#EXT-X-PART:DURATION=1.000,URI="segment/0.0.m4s"\n',
      ),
    );
    const callWS = vi.fn(async () => ({
      url: "/api/hls/token/master_playlist.m3u8",
    }));
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
      { initialMuted: true, lowLatencyHls: true },
    );

    await vi.waitFor(() => expect(hlsMock.attachMedia).toHaveBeenCalled());
    const video = hlsMock.attachMedia.mock.calls[0][0] as HTMLVideoElement;
    video.dispatchEvent(new Event("loadeddata"));
    const connection = await connecting;

    const lowLatencyUrl =
      "https://ha.example/api/hls/token/playlist.m3u8?_HLS_msn=0&_HLS_part=0";
    expect(fetch).toHaveBeenCalledWith(
      lowLatencyUrl,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(hlsMock.loadSource).toHaveBeenCalledWith(lowLatencyUrl);
    expect(hlsMock.construct).toHaveBeenCalledWith(
      expect.objectContaining({
        liveMaxLatencyDuration: 8,
        liveSyncDuration: 2,
        lowLatencyMode: true,
      }),
    );
    expect(timing.snapshot().hlsMode).toBe("low_latency");
    connection.close();
  });

  it("uses standard HLS when low-latency mode is disabled", async () => {
    vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue("");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("#EXTM3U\n#EXT-X-TARGETDURATION:6\n"),
    );
    const api: HomeAssistantApi = {
      identity: {} as HomeAssistantApi["identity"],
      callWS: vi.fn(async () => ({
        url: "/api/hls/token/master_playlist.m3u8",
      })) as HomeAssistantApi["callWS"],
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
      { initialMuted: true, lowLatencyHls: false },
    );

    await vi.waitFor(() => expect(hlsMock.attachMedia).toHaveBeenCalled());
    const video = hlsMock.attachMedia.mock.calls[0][0] as HTMLVideoElement;
    video.dispatchEvent(new Event("loadeddata"));
    const connection = await connecting;

    const standardUrl = "https://ha.example/api/hls/token/playlist.m3u8";
    expect(fetch).toHaveBeenCalledWith(
      standardUrl,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(hlsMock.loadSource).toHaveBeenCalledWith(standardUrl);
    expect(hlsMock.construct).toHaveBeenCalledWith(
      expect.objectContaining({
        liveMaxLatencyDuration: 30,
        liveSyncDuration: 18,
        lowLatencyMode: false,
      }),
    );
    expect(timing.snapshot().hlsMode).toBe("standard");
    connection.close();
  });

  it("falls back to standard HLS when the LL-HLS bootstrap is rejected", async () => {
    vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue("");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(
        new Response("#EXTM3U\n#EXT-X-TARGETDURATION:6\n"),
      );
    const api: HomeAssistantApi = {
      identity: {} as HomeAssistantApi["identity"],
      callWS: vi.fn(async () => ({
        url: "/api/hls/token/master_playlist.m3u8",
      })) as HomeAssistantApi["callWS"],
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
      { initialMuted: true, lowLatencyHls: true },
    );

    await vi.waitFor(() => expect(hlsMock.attachMedia).toHaveBeenCalled());
    const video = hlsMock.attachMedia.mock.calls[0][0] as HTMLVideoElement;
    video.dispatchEvent(new Event("loadeddata"));
    const connection = await connecting;

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://ha.example/api/hls/token/playlist.m3u8",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(hlsMock.loadSource).toHaveBeenCalledWith(
      "https://ha.example/api/hls/token/playlist.m3u8",
    );
    expect(timing.snapshot().hlsMode).toBe("standard");
    connection.close();
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
    const onVideo = vi.fn((video: HTMLVideoElement) => {
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

  it("reports an intentional startup cancellation without a stray rejection", async () => {
    let resolveStream: ((value: { url: string }) => void) | undefined;
    const streamResponse = new Promise<{ url: string }>((resolve) => {
      resolveStream = resolve;
    });
    const api: HomeAssistantApi = {
      identity: {} as HomeAssistantApi["identity"],
      callWS: vi.fn(() => streamResponse) as HomeAssistantApi["callWS"],
      resolveUrl: (path) => `https://ha.example${path}`,
      subscribeMessage: vi.fn(),
    };
    const abort = new AbortController();
    const connecting = createHomeAssistantHlsConnection(
      api,
      "camera.front",
      abort.signal,
      vi.fn(),
      new LiveStartupTiming("home_assistant_hls:camera.front"),
    );

    abort.abort();
    await expect(connecting).rejects.toMatchObject({ name: "AbortError" });
    resolveStream?.({ url: "/api/hls/front.m3u8" });
    await Promise.resolve();
  });
});
