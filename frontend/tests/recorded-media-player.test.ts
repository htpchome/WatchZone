import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LitElement } from "lit";

import {
  MEDIA_SESSION_RUNTIME_KEY,
  RECORDING_SCRUBBER_EVENT,
} from "../src/core/constants";
import { MediaSessionManager } from "../src/core/media-session-manager";
import type { RecordedMediaRequest } from "../src/core/recorded-media";
import type { DraggableRecordedVideoDialog } from "../src/features/media-viewer/draggable-dialog";
import type { RecordedVideoPlayer } from "../src/features/media-viewer/recorded-video-player";
import type { RecordedVideoTransport } from "../src/features/media-viewer/transport-controls";
import type { RecordedVideoViewer } from "../src/features/media-viewer/recorded-video-viewer";
import "../src/features/media-viewer";
import "../src/features/media-viewer/draggable-dialog";
import "../src/features/media-viewer/recorded-video-player";

const request: RecordedMediaRequest = {
  id: "frigate:event-1",
  kind: "video",
  presentation: "review",
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

  it("opens direct file playback muted with custom transport controls and cleans up", async () => {
    const player = document.createElement(
      "wzc-recorded-video-player",
    ) as RecordedVideoPlayer;
    const callWS = vi.fn().mockResolvedValue({
      path: "/signed/clip.mp4?authSig=test",
    });
    player.api = {
      callWS,
      identity: { subscribeMessage: vi.fn() },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as RecordedVideoPlayer["api"];
    player.request = request;
    document.body.append(player);
    await player.updateComplete;
    const video = player.shadowRoot?.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.controls).toBe(false);
    expect(video?.autoplay).toBe(true);
    expect(video?.muted).toBe(true);
    const transport = player.shadowRoot?.querySelector(
      "wzc-recorded-video-transport",
    );
    expect(transport).not.toBeNull();
    expect(
      player.shadowRoot?.querySelector("wzc-recording-scrubber"),
    ).toBeNull();
    expect(
      transport?.shadowRoot?.querySelector('[data-control="future"]'),
    ).toMatchObject({ disabled: true });
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
    const player = document.createElement(
      "wzc-recorded-video-player",
    ) as RecordedVideoPlayer;
    player.api = {
      callWS,
      identity: { subscribeMessage: vi.fn() },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as RecordedVideoPlayer["api"];
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

  it("drives playback, seeking, mute, and volume through the custom transport", async () => {
    const player = document.createElement(
      "wzc-recorded-video-player",
    ) as RecordedVideoPlayer;
    player.request = request;
    document.body.append(player);
    await player.updateComplete;
    const video = player.shadowRoot?.querySelector("video");
    expect(video).not.toBeNull();
    if (!video) return;
    Object.defineProperties(video, {
      currentTime: { configurable: true, value: 30, writable: true },
      duration: { configurable: true, value: 120 },
      paused: { configurable: true, value: true, writable: true },
      volume: { configurable: true, value: 1, writable: true },
    });
    video.dispatchEvent(new Event("durationchange"));
    video.dispatchEvent(new Event("timeupdate"));
    await player.updateComplete;
    const transport = player.shadowRoot?.querySelector(
      "wzc-recorded-video-transport",
    ) as RecordedVideoTransport;
    await transport.updateComplete;

    const playButton = transport.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-control="toggle_play"]',
    );
    playButton?.click();
    await vi.waitFor(() => expect(video.play).toHaveBeenCalled());

    Object.defineProperty(video, "paused", {
      configurable: true,
      value: false,
      writable: true,
    });
    video.dispatchEvent(new Event("play"));
    await player.updateComplete;
    await transport.updateComplete;
    transport.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-control="toggle_play"]')
      ?.click();
    expect(video.pause).toHaveBeenCalled();

    const timeline = transport.shadowRoot?.querySelector<HTMLInputElement>(
      'input[aria-label="Recorded video position"]',
    );
    expect(timeline?.max).toBe("120");
    expect(timeline?.value).toBe("30");
    if (timeline) {
      timeline.value = "75";
      timeline.dispatchEvent(new Event("input", { bubbles: true }));
    }
    expect(video.currentTime).toBe(75);

    const volume = transport.shadowRoot?.querySelector<HTMLInputElement>(
      'input[aria-label="Recorded video volume"]',
    );
    if (volume) {
      volume.value = "0.35";
      volume.dispatchEvent(new Event("input", { bubbles: true }));
    }
    expect(video.volume).toBe(0.35);
    expect(video.muted).toBe(false);
    await player.updateComplete;
    await transport.updateComplete;
    transport.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-control="toggle_mute"]')
      ?.click();
    expect(video.muted).toBe(true);
  });

  it("maps recording activity markers across timeline gaps and starts playback", async () => {
    const start = Date.UTC(2026, 10, 10, 14) / 1000;
    const player = document.createElement(
      "wzc-recorded-video-player",
    ) as RecordedVideoPlayer;
    player.request = {
      ...request,
      id: "frigate:front:recording-hour",
      presentation: "recording",
      timeline: {
        camera: "front",
        entityId: "camera.front",
        startTime: start,
        endTime: start + 3600,
        spans: [
          { startTime: start, endTime: start + 600, mediaOffset: 0 },
          {
            startTime: start + 1200,
            endTime: start + 3600,
            mediaOffset: 600,
          },
        ],
        markers: [
          {
            classification: "alert",
            endTime: start + 1560,
            id: "review-1",
            startTime: start + 1500,
            thumbnailUrl: "/review-1.webp",
          },
        ],
      },
    };
    document.body.append(player);
    await player.updateComplete;
    const video = player.shadowRoot?.querySelector("video");
    expect(video).not.toBeNull();
    if (!video) return;
    Object.defineProperties(video, {
      currentTime: { configurable: true, value: 0, writable: true },
      duration: { configurable: true, value: 1500 },
      paused: { configurable: true, value: true, writable: true },
    });
    video.dispatchEvent(new Event("durationchange"));
    await player.updateComplete;
    const scrubber = player.shadowRoot?.querySelector("wzc-recording-scrubber");
    await (scrubber as LitElement | null)?.updateComplete;

    scrubber?.shadowRoot?.querySelector<HTMLButtonElement>(".marker")?.click();

    expect(video.currentTime).toBe(450);
    await vi.waitFor(() => expect(video.play).toHaveBeenCalled());
    expect(
      player.shadowRoot
        ?.querySelector("wzc-recorded-video-transport")
        ?.shadowRoot?.querySelector('[data-control="toggle_play"]'),
    ).not.toBeNull();
  });

  it("selects, previews, and downloads a bounded recording segment", async () => {
    const start = Date.UTC(2026, 10, 10, 14) / 1000;
    const callWS = vi.fn(async (message: { readonly type: string }) => {
      if (message.type === "watchzone/recordings/segment") {
        return {
          filename: "front-segment.mp4",
          path: "/segment.mp4",
          playback_sources: [
            {
              content_type: "video/mp4",
              transport: "file",
              url: "/segment-preview.mp4",
            },
          ],
          preferred_transport: "file",
        };
      }
      return { path: "/signed.mp4" };
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const player = document.createElement(
      "wzc-recorded-video-player",
    ) as RecordedVideoPlayer;
    player.api = {
      callWS,
      identity: { subscribeMessage: vi.fn() },
      locale: { language: "en", time_format: "12", time_zone: "UTC" },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as RecordedVideoPlayer["api"];
    player.request = {
      ...request,
      id: "frigate:front:recording-hour",
      presentation: "recording",
      timeline: {
        camera: "front",
        entityId: "camera.front",
        startTime: start,
        endTime: start + 3600,
        spans: [{ startTime: start, endTime: start + 3600, mediaOffset: 0 }],
        markers: [],
      },
    };
    document.body.append(player);
    await player.updateComplete;
    const video = player.shadowRoot?.querySelector("video");
    expect(video).not.toBeNull();
    if (!video) return;
    Object.defineProperties(video, {
      currentTime: { configurable: true, value: 0, writable: true },
      duration: { configurable: true, value: 3600 },
      paused: { configurable: true, value: true, writable: true },
    });
    video.dispatchEvent(new Event("durationchange"));
    await player.updateComplete;
    const scrubber = player.shadowRoot?.querySelector("wzc-recording-scrubber");
    await (scrubber as LitElement | null)?.updateComplete;
    scrubber?.shadowRoot
      ?.querySelector<HTMLButtonElement>(".segment-toggle")
      ?.click();
    await player.updateComplete;

    expect(
      player.shadowRoot?.querySelector("wzc-recorded-video-transport"),
    ).not.toBeNull();
    const activeScrubber = player.shadowRoot?.querySelector(
      "wzc-recording-scrubber",
    );
    activeScrubber?.dispatchEvent(
      new CustomEvent(RECORDING_SCRUBBER_EVENT, {
        bubbles: true,
        composed: true,
        detail: { action: "set_segment_start", timestamp: start - 60 },
      }),
    );
    activeScrubber?.dispatchEvent(
      new CustomEvent(RECORDING_SCRUBBER_EVENT, {
        bubbles: true,
        composed: true,
        detail: { action: "set_segment_end", timestamp: start + 120 },
      }),
    );
    await player.updateComplete;
    const manager = player.shadowRoot?.querySelector(
      "wzc-recording-segment-manager",
    );
    await (manager as LitElement | null)?.updateComplete;
    const buttons = [
      ...(manager?.shadowRoot?.querySelectorAll<HTMLButtonElement>("button") ??
        []),
    ];
    buttons.find((button) => button.textContent?.includes("Preview"))?.click();
    await vi.waitFor(() =>
      expect(callWS).toHaveBeenCalledWith({
        type: "watchzone/recordings/segment",
        entity_id: "camera.front",
        start_time: start - 60,
        end_time: start + 120,
      }),
    );
    video.dispatchEvent(new Event("loadeddata"));
    await vi.waitFor(() => expect(video.play).toHaveBeenCalled());

    buttons.find((button) => button.classList.contains("primary"))?.click();
    await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(callWS).toHaveBeenCalledWith({
      type: "watchzone/recordings/segment",
      entity_id: "camera.front",
      start_time: start - 60,
      end_time: start + 120,
    });
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

    const viewer = document.createElement(
      "wzc-recorded-video-viewer",
    ) as RecordedVideoViewer;
    viewer.request = request;
    document.body.append(viewer);
    await viewer.updateComplete;
    await vi.waitFor(() =>
      expect(
        viewer.shadowRoot?.querySelector("wzc-recorded-video-dialog"),
      ).not.toBeNull(),
    );
    const container = viewer.shadowRoot?.querySelector(
      "wzc-recorded-video-dialog",
    ) as DraggableRecordedVideoDialog;
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
    const player = container.shadowRoot?.querySelector(
      "wzc-recorded-video-player",
    );
    vi.spyOn(player!, "getBoundingClientRect").mockReturnValue({
      bottom: 390,
      height: 272.25,
      left: 108,
      right: 592,
      top: 117.75,
      width: 484,
      x: 108,
      y: 117.75,
      toJSON: () => ({}),
    });
    container.shadowRoot
      ?.querySelector(".resize-handle")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(Number.parseFloat(dialog?.style.width ?? "0")).toBeGreaterThan(484);

    container.close();
    expect(states).toEqual([false, true, false]);
    await container.updateComplete;
    expect(
      container.shadowRoot?.querySelector("wzc-recorded-video-player"),
    ).toBeNull();
  });

  it("centers its stage-sized initial placement on the WatchZone card", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "show", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    const viewer = document.createElement(
      "wzc-recorded-video-viewer",
    ) as RecordedVideoViewer;
    document.body.append(viewer);
    await viewer.updateComplete;
    await vi.waitFor(() =>
      expect(
        viewer.shadowRoot?.querySelector("wzc-recorded-video-dialog"),
      ).not.toBeNull(),
    );
    const container = viewer.shadowRoot?.querySelector(
      "wzc-recorded-video-dialog",
    ) as DraggableRecordedVideoDialog;
    await container.updateComplete;
    const dialog = container.shadowRoot?.querySelector("dialog");
    expect(dialog).not.toBeNull();
    if (!dialog) return;
    vi.spyOn(dialog, "getBoundingClientRect").mockImplementation(() => {
      const width = Number.parseFloat(dialog.style.width) || 300;
      const height = 300;
      const left = Number.parseFloat(dialog.style.left) || 0;
      const top = Number.parseFloat(dialog.style.top) || 0;
      return {
        bottom: top + height,
        height,
        left,
        right: left + width,
        top,
        width,
        x: left,
        y: top,
        toJSON: () => ({}),
      };
    });

    viewer.initialSize = {
      centerX: 700,
      centerY: 450,
      height: 337.5,
      width: 600,
    };
    viewer.request = request;
    await viewer.updateComplete;
    await container.updateComplete;

    expect(dialog.classList.contains("dragged")).toBe(true);
    expect(dialog.style.width).toBe("600px");
    expect(dialog.style.left).toBe("400px");
    expect(dialog.style.top).toBe("300px");
  });

  it("opens snapshots in the shared dialog without muting live audio", async () => {
    const manager = new MediaSessionManager();
    (window as unknown as Record<string, unknown>)[MEDIA_SESSION_RUNTIME_KEY] =
      manager;
    const states: boolean[] = [];
    manager.subscribeForcedMute((active) => states.push(active));
    Object.defineProperty(HTMLDialogElement.prototype, "show", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    const viewer = document.createElement(
      "wzc-recorded-video-viewer",
    ) as RecordedVideoViewer;
    viewer.api = {
      callWS: vi.fn(),
      identity: { subscribeMessage: vi.fn() },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as RecordedVideoViewer["api"];
    viewer.request = {
      id: "frigate:event-1:snapshot",
      kind: "snapshot",
      presentation: "review",
      preferredTransport: "file",
      sources: [
        {
          content_type: "image/jpeg",
          transport: "file",
          url: "/snapshot.jpg",
        },
      ],
      title: "Front snapshot",
    };
    document.body.append(viewer);
    await viewer.updateComplete;
    await vi.waitFor(() =>
      expect(
        viewer.shadowRoot?.querySelector("wzc-recorded-video-dialog"),
      ).not.toBeNull(),
    );
    const container = viewer.shadowRoot?.querySelector(
      "wzc-recorded-video-dialog",
    ) as DraggableRecordedVideoDialog;
    await container.updateComplete;

    expect(container.shadowRoot?.querySelector("img.snapshot")).toMatchObject({
      alt: "Front snapshot",
      src: "https://ha.local/snapshot.jpg",
    });
    expect(
      container.shadowRoot?.querySelector("wzc-recorded-video-player"),
    ).toBeNull();
    expect(states).toEqual([false]);
  });
});
