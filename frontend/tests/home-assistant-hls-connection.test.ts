import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHomeAssistantHlsConnection } from "../src/connections/home-assistant/hls";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import { LiveStartupTiming } from "../src/core/live-startup-timing";

const hlsMock = vi.hoisted(() => ({
  attachMedia: vi.fn(),
  destroy: vi.fn(),
  loadSource: vi.fn(),
  on: vi.fn(),
}));

vi.mock("hls.js/dist/hls.light.mjs", () => ({
  default: class FakeHls {
    public static readonly Events = { ERROR: "error" };
    public static isSupported(): boolean {
      return true;
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
    expect(video?.src).toBe("https://ha.example/api/hls/front.m3u8");
    expect(timing.snapshot().phases).toMatchObject({
      first_frame_decoded: expect.any(Number),
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
    expect(timing.snapshot().phases).toMatchObject({
      hls_engine_loaded: expect.any(Number),
      hls_manifest_loaded: expect.any(Number),
    });

    connection.close();
    expect(hlsMock.destroy).toHaveBeenCalledOnce();
  });
});
