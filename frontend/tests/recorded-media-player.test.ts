import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MEDIA_SESSION_RUNTIME_KEY } from "../src/core/constants";
import { MediaSessionManager } from "../src/core/media-session-manager";
import type { RecordedMediaRequest } from "../src/core/recorded-media";
import type { MediaPlayer } from "../src/media/media-player";
import type { MediaPlayerContainer } from "../src/media/media-player-container";
import "../src/media";

const request: RecordedMediaRequest = {
  id: "frigate:event-1",
  posterUrl: "https://ha.local/poster.jpg",
  preferredTransport: "file",
  sources: [
    {
      content_type: "video/mp4",
      transport: "file",
      url: "/clip.mp4",
    },
  ],
  title: "Person",
};

describe("recorded media player", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  });

  afterEach(() => {
    document.body.replaceChildren();
    delete (window as unknown as Record<string, unknown>)[
      MEDIA_SESSION_RUNTIME_KEY
    ];
    vi.restoreAllMocks();
    Reflect.deleteProperty(HTMLDialogElement.prototype, "show");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  });

  it("opens direct file playback muted with native controls and cleans up", async () => {
    const player = document.createElement("wzc-media-player") as MediaPlayer;
    const callWS = vi.fn().mockResolvedValue({
      path: "/signed/clip.mp4?authSig=test",
    });
    player.api = {
      callWS,
      identity: { subscribeMessage: vi.fn() },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as MediaPlayer["api"];
    player.request = request;
    document.body.append(player);
    await player.updateComplete;
    const video = player.shadowRoot?.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.controls).toBe(true);
    expect(video?.autoplay).toBe(true);
    expect(video?.muted).toBe(true);
    await vi.waitFor(() =>
      expect(video?.src).toBe("https://ha.local/signed/clip.mp4?authSig=test"),
    );
    expect(callWS).toHaveBeenCalledWith({
      type: "auth/sign_path",
      path: "/clip.mp4",
      expires: 3600,
    });

    video?.dispatchEvent(new Event("loadeddata"));
    await vi.waitFor(() => expect(video?.play).toHaveBeenCalled());
    player.remove();
    expect(video?.hasAttribute("src")).toBe(false);
  });

  it("uses a signed native HLS source for alert recording ranges", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue(
      "probably",
    );
    const callWS = vi.fn().mockResolvedValue({
      path: "/signed/alert/index.m3u8?authSig=test",
    });
    const player = document.createElement("wzc-media-player") as MediaPlayer;
    player.api = {
      callWS,
      identity: { subscribeMessage: vi.fn() },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as MediaPlayer["api"];
    player.request = {
      ...request,
      id: "frigate:review-1",
      preferredTransport: "hls",
      sources: [
        {
          content_type: "application/vnd.apple.mpegurl",
          transport: "hls",
          url: "/api/frigate/main/vod/front/start/100/end/160/index.m3u8",
        },
        ...request.sources,
      ],
    };
    document.body.append(player);
    await player.updateComplete;
    const video = player.shadowRoot?.querySelector("video");
    await vi.waitFor(() =>
      expect(video?.src).toBe(
        "https://ha.local/signed/alert/index.m3u8?authSig=test",
      ),
    );
    expect(callWS).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/frigate/main/vod/front/start/100/end/160/index.m3u8",
      }),
    );
    video?.dispatchEvent(new Event("loadeddata"));
    await vi.waitFor(() => expect(video?.play).toHaveBeenCalled());
  });

  it("acquires and releases the global live-audio mute with the modal", async () => {
    const manager = new MediaSessionManager();
    (window as unknown as Record<string, unknown>)[MEDIA_SESSION_RUNTIME_KEY] =
      manager;
    const states: boolean[] = [];
    manager.subscribeForcedMute((active) => states.push(active));
    Object.defineProperties(HTMLDialogElement.prototype, {
      show: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.setAttribute("open", "");
        },
      },
      close: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.removeAttribute("open");
          this.dispatchEvent(new Event("close"));
        },
      },
    });

    const container = document.createElement(
      "wzc-media-player-container",
    ) as MediaPlayerContainer;
    container.request = request;
    document.body.append(container);
    await container.updateComplete;
    expect(container.shadowRoot?.querySelector("dialog")?.open).toBe(true);
    expect(states).toEqual([false, true]);
    const dialog = container.shadowRoot?.querySelector("dialog");
    vi.spyOn(dialog!, "getBoundingClientRect").mockReturnValue({
      bottom: 400,
      height: 300,
      left: 100,
      right: 600,
      top: 100,
      width: 500,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });
    container.shadowRoot
      ?.querySelector(".resize-handle")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(dialog?.style.width).toBe("516px");

    container.close();
    expect(states).toEqual([false, true, false]);
    await container.updateComplete;
    expect(container.shadowRoot?.querySelector("wzc-media-player")).toBeNull();
  });
});
