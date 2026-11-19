import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LitElement } from "lit";

import {
  MEDIA_SESSION_RUNTIME_KEY,
  RECORDED_MEDIA_BOTTOM_DRAWER_TAG,
  RECORDED_MEDIA_EXPORT_EVENT,
  RECORDING_SCRUBBER_EVENT,
} from "../src/core/constants";
import { MediaSessionManager } from "../src/core/media-session-manager";
import type { RecordedMediaRequest } from "../src/core/recorded-media";
import type { ReviewMediaDialog } from "../src/features/media-viewer/review-media-dialog";
import { mediaViewerPresentation } from "../src/features/media-viewer/presentation";
import type { RecordedVideoPlayer } from "../src/features/media-viewer/recorded-video-player";
import type { RecordedVideoTransport } from "../src/features/media-viewer/transport-controls";
import type { RecordedVideoViewer } from "../src/features/media-viewer/recorded-video-viewer";
import "../src/features/media-viewer";
import "../src/features/media-viewer/review-media-dialog";
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
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLDialogElement.prototype, "show");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showPopover");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "hidePopover");
  });

  it("keeps event, review, and recording modal implementations distinct", async () => {
    const definitions = (["event", "review", "recording"] as const).map(
      (presentation) => mediaViewerPresentation(presentation),
    );

    expect(new Set(definitions.map(({ tagName }) => tagName)).size).toBe(3);
    await Promise.all(definitions.map(({ load }) => load()));
    for (const { tagName } of definitions) {
      expect(customElements.get(tagName)).toBeDefined();
    }
  });

  it("selects one shared bottom drawer shell for every recorded presentation", async () => {
    const definitions = (
      ["event", "export", "recording", "review"] as const
    ).map((presentation) =>
      mediaViewerPresentation(presentation, "bottom_drawer"),
    );

    expect(definitions.map(({ tagName }) => tagName)).toEqual([
      RECORDED_MEDIA_BOTTOM_DRAWER_TAG,
      RECORDED_MEDIA_BOTTOM_DRAWER_TAG,
      RECORDED_MEDIA_BOTTOM_DRAWER_TAG,
      RECORDED_MEDIA_BOTTOM_DRAWER_TAG,
    ]);
    await definitions[0].load();
    expect(customElements.get(RECORDED_MEDIA_BOTTOM_DRAWER_TAG)).toBeDefined();
  });

  it("opens the configured non-blocking drawer without native cancel dismissal", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showPopover", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.dataset.testPopoverOpen = "true";
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "hidePopover", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        delete this.dataset.testPopoverOpen;
      },
    });
    const viewer = document.createElement(
      "wzc-recorded-video-viewer",
    ) as RecordedVideoViewer;
    viewer.playerType = "bottom_drawer";
    viewer.request = request;
    document.body.append(viewer);
    await viewer.updateComplete;
    await vi.waitFor(() =>
      expect(
        viewer.shadowRoot?.querySelector(RECORDED_MEDIA_BOTTOM_DRAWER_TAG),
      ).not.toBeNull(),
    );
    const drawer = viewer.shadowRoot?.querySelector(
      RECORDED_MEDIA_BOTTOM_DRAWER_TAG,
    ) as LitElement;
    await drawer.updateComplete;
    const dialog = drawer.shadowRoot?.querySelector("dialog");

    expect(dialog?.dataset.testPopoverOpen).toBe("true");
    expect(
      dialog?.dispatchEvent(new Event("cancel", { cancelable: true })),
    ).toBe(false);
    expect(dialog?.dataset.testPopoverOpen).toBe("true");
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
    expect(player.shadowRoot?.querySelector(".rate-control")).toBeNull();
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

  it("steps recorded playback speed and resets it for new media", async () => {
    const player = document.createElement(
      "wzc-recorded-video-player",
    ) as RecordedVideoPlayer;
    player.request = {
      ...request,
      presentation: "recording",
      timeline: {
        availableEndTime: 3600,
        availableStartTime: 0,
        camera: "front",
        entityId: "camera.front",
        startTime: 0,
        endTime: 3600,
        spans: [{ startTime: 0, endTime: 3600, mediaOffset: 0 }],
        markers: [],
        selectionEndTime: 3600,
        selectionSpans: [{ startTime: 0, endTime: 3600 }],
        selectionStartTime: 0,
      },
    };
    document.body.append(player);
    await player.updateComplete;
    const video = player.shadowRoot?.querySelector("video");
    const rateControl = player.shadowRoot?.querySelector(".rate-control");
    const rateDropdown = rateControl?.querySelector("ha-dropdown");
    expect(rateControl).not.toBeNull();
    expect(
      player.shadowRoot?.querySelector(".rate-label")?.textContent,
    ).toContain("Playback speed");
    expect(rateControl?.querySelectorAll("ha-dropdown-item")).toHaveLength(7);
    expect(rateControl?.querySelector(".rate-trigger")?.textContent).toContain(
      "1×",
    );
    const decrease =
      rateControl?.querySelector<HTMLButtonElement>("button.decrease");
    const increase =
      rateControl?.querySelector<HTMLButtonElement>("button.increase");
    expect(video?.playbackRate).toBe(1);

    increase?.click();
    await player.updateComplete;
    expect(video?.playbackRate).toBe(2);
    expect(rateControl?.querySelector(".rate-trigger")?.textContent).toContain(
      "2×",
    );

    increase?.click();
    increase?.click();
    increase?.click();
    await player.updateComplete;
    expect(video?.playbackRate).toBe(25);
    expect(increase?.disabled).toBe(true);

    decrease?.click();
    await player.updateComplete;
    expect(video?.playbackRate).toBe(10);

    const quarterRate = rateControl?.querySelector<
      HTMLElement & { value?: string }
    >('ha-dropdown-item[value="0.25"]');
    if (rateDropdown && quarterRate) {
      quarterRate.value = "0.25";
      rateDropdown.dispatchEvent(
        new CustomEvent("wa-select", { detail: { item: quarterRate } }),
      );
    }
    await player.updateComplete;
    expect(video?.playbackRate).toBe(0.25);
    expect(quarterRate?.hasAttribute("selected")).toBe(true);

    player.request = { ...player.request, id: "frigate:event-2" };
    await player.updateComplete;
    expect(video?.playbackRate).toBe(1);
    expect(rateControl?.querySelector(".rate-trigger")?.textContent).toContain(
      "1×",
    );
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
        availableEndTime: start + 3600,
        availableStartTime: start,
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
        selectionEndTime: start + 3600,
        selectionSpans: [
          { startTime: start, endTime: start + 600 },
          { startTime: start + 1200, endTime: start + 3600 },
        ],
        selectionStartTime: start,
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
      if (message.type === "watchzone/exports/prepare") {
        return { name: "Front selected recording" };
      }
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
    const append = vi.spyOn(document.body, "append");
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
        availableEndTime: start + 3600,
        availableStartTime: start,
        camera: "front",
        entityId: "camera.front",
        startTime: start,
        endTime: start + 3600,
        spans: [{ startTime: start, endTime: start + 3600, mediaOffset: 0 }],
        markers: [],
        selectionEndTime: start + 3600,
        selectionSpans: [{ startTime: start - 60, endTime: start + 3600 }],
        selectionStartTime: start - 60,
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
    await player.toggleSegmentSelection();
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
    await vi.waitFor(() =>
      expect(callWS).toHaveBeenCalledWith({
        type: "auth/sign_path",
        path: "/segment-preview.mp4",
        expires: 3600,
      }),
    );
    video.dispatchEvent(new Event("loadeddata"));
    await vi.waitFor(() => expect(video.play).toHaveBeenCalled());
    await player.updateComplete;
    const previewingManager = player.shadowRoot?.querySelector(
      "wzc-recording-segment-manager",
    );
    await (previewingManager as LitElement | null)?.updateComplete;
    await vi.waitFor(() =>
      expect(previewingManager?.shadowRoot?.textContent).toContain(
        "Stop Preview",
      ),
    );

    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 180,
    });
    video.dispatchEvent(new Event("durationchange"));
    const signedBeforeSeek = callWS.mock.calls.filter(
      ([message]) => message.type === "auth/sign_path",
    ).length;
    activeScrubber?.dispatchEvent(
      new CustomEvent(RECORDING_SCRUBBER_EVENT, {
        bubbles: true,
        composed: true,
        detail: { action: "seek", timestamp: start + 60 },
      }),
    );
    expect(video.currentTime).toBe(120);
    expect(
      callWS.mock.calls.filter(
        ([message]) => message.type === "auth/sign_path",
      ),
    ).toHaveLength(signedBeforeSeek);

    previewingManager?.shadowRoot
      ?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
      ?.click();
    await vi.waitFor(() =>
      expect(
        callWS.mock.calls.filter(
          ([message]) => message.type === "auth/sign_path",
        ).length,
      ).toBeGreaterThan(signedBeforeSeek),
    );
    video.dispatchEvent(new Event("loadeddata"));
    await vi.waitFor(() =>
      expect(
        previewingManager?.shadowRoot?.querySelector<HTMLButtonElement>(
          'button[aria-pressed="false"]',
        )?.textContent,
      ).toContain("Preview Segment"),
    );

    const exportIntent = vi.fn();
    player.addEventListener(RECORDED_MEDIA_EXPORT_EVENT, exportIntent);
    previewingManager?.shadowRoot
      ?.querySelector<HTMLButtonElement>('button[aria-label="Export Segment"]')
      ?.click();
    await vi.waitFor(() => expect(exportIntent).toHaveBeenCalledOnce());
    expect(exportIntent.mock.calls[0]?.[0].detail).toEqual({
      camera: "front",
      endTime: start + 120,
      entityId: "camera.front",
      name: "Front selected recording",
      sourceId: "frigate:front:recording-hour",
      startTime: start - 60,
    });

    buttons.find((button) => button.classList.contains("primary"))?.click();
    await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
    const downloadAnchor = append.mock.calls.find(
      ([node]) => node instanceof HTMLAnchorElement,
    )?.[0] as HTMLAnchorElement | undefined;
    expect(downloadAnchor?.dataset.recordedMediaOpener).toBe("true");
    expect(callWS).toHaveBeenCalledWith({
      type: "watchzone/recordings/segment",
      entity_id: "camera.front",
      start_time: start - 60,
      end_time: start + 120,
    });

    await player.toggleSegmentSelection();
    await vi.waitFor(() =>
      expect(
        player.shadowRoot?.querySelector("wzc-recording-segment-manager"),
      ).toBeNull(),
    );
  });

  it("acquires and releases the global live-audio mute with the modal", async () => {
    const manager = new MediaSessionManager();
    (window as unknown as Record<string, unknown>)[MEDIA_SESSION_RUNTIME_KEY] =
      manager;
    const states: boolean[] = [];
    manager.subscribeForcedMute((active) => states.push(active));
    Object.defineProperties(HTMLDialogElement.prototype, {
      showPopover: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.dataset.testPopoverOpen = "true";
        },
      },
      hidePopover: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          delete this.dataset.testPopoverOpen;
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
        viewer.shadowRoot?.querySelector("wzc-review-media-dialog"),
      ).not.toBeNull(),
    );
    const container = viewer.shadowRoot?.querySelector(
      "wzc-review-media-dialog",
    ) as ReviewMediaDialog;
    await container.updateComplete;
    const openDialog = container.shadowRoot?.querySelector("dialog");
    expect(openDialog?.getAttribute("popover")).toBe("manual");
    expect(openDialog?.dataset.testPopoverOpen).toBe("true");
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
    expect(openDialog?.dataset.testPopoverOpen).toBeUndefined();
    await container.updateComplete;
    expect(
      container.shadowRoot?.querySelector("wzc-recorded-video-player"),
    ).toBeNull();
  });

  it("preserves native placement while matching the initial stage width", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "show", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    const viewer = document.createElement(
      "wzc-recorded-video-viewer",
    ) as RecordedVideoViewer;
    viewer.initialSize = {
      height: 337.5,
      width: 600,
    };
    viewer.request = request;
    document.body.append(viewer);
    await viewer.updateComplete;
    await vi.waitFor(() =>
      expect(
        viewer.shadowRoot?.querySelector("wzc-review-media-dialog"),
      ).not.toBeNull(),
    );
    const container = viewer.shadowRoot?.querySelector(
      "wzc-review-media-dialog",
    ) as ReviewMediaDialog;
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

    expect(dialog.classList.contains("dragged")).toBe(false);
    expect(dialog.style.width).toBe("600px");
    expect(dialog.style.left).toBe("");
    expect(dialog.style.top).toBe("");
  });

  it("keeps ordinary clip sizing independent from media zoom rerenders", async () => {
    const observed: Element[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        public disconnect(): void {}

        public observe(target: Element): void {
          observed.push(target);
        }

        public unobserve(): void {}
      },
    );
    Object.defineProperty(HTMLDialogElement.prototype, "show", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
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
        viewer.shadowRoot?.querySelector("wzc-review-media-dialog"),
      ).not.toBeNull(),
    );
    const container = viewer.shadowRoot?.querySelector(
      "wzc-review-media-dialog",
    ) as ReviewMediaDialog;
    await container.updateComplete;
    const player = container.shadowRoot?.querySelector(
      "wzc-recorded-video-player",
    ) as RecordedVideoPlayer;
    await player.updateComplete;

    expect(observed).toContain(
      player.shadowRoot?.querySelector(".viewport") as Element,
    );
    expect(observed).not.toContain(player);
  });

  it("presents review details and switches media variants in place", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "show", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    const viewReview = vi.fn();
    const exportReview = vi.fn();
    const viewer = document.createElement(
      "wzc-recorded-video-viewer",
    ) as RecordedVideoViewer;
    viewer.api = {
      callWS: vi.fn().mockResolvedValue({ path: "/signed/review.mp4" }),
      identity: { subscribeMessage: vi.fn() },
      locale: { language: "en" },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as RecordedVideoViewer["api"];
    viewer.request = {
      actions: {
        exportReview,
        variants: {
          snapshot: {
            download: { filename: "front.jpg", path: "/snapshot.jpg" },
            id: "review-1:snapshot",
            kind: "snapshot",
            preferredTransport: "file",
            sources: [
              {
                content_type: "image/jpeg",
                transport: "file",
                url: "/snapshot.jpg",
              },
            ],
          },
          video: {
            download: { filename: "front.mp4", path: "/review.mp4" },
            id: "review-1",
            kind: "video",
            posterUrl: "/snapshot.jpg",
            preferredTransport: "file",
            sources: [
              {
                content_type: "video/mp4",
                transport: "file",
                url: "/review.mp4",
              },
            ],
          },
        },
        viewReview,
      },
      id: "review-1:snapshot",
      kind: "snapshot",
      metadata: {
        camera: "front_door",
        classification: "alert",
        endTime: 1_700_000_020,
        objects: ["person", "delivery_driver"],
        score: 0.92,
        startTime: 1_700_000_000,
        zones: ["porch"],
      },
      presentation: "review",
      preferredTransport: "file",
      sources: [
        {
          content_type: "image/jpeg",
          transport: "file",
          url: "/snapshot.jpg",
        },
      ],
      title: "Front door snapshot",
    };
    document.body.append(viewer);
    await viewer.updateComplete;
    await vi.waitFor(() =>
      expect(
        viewer.shadowRoot?.querySelector("wzc-review-media-dialog"),
      ).not.toBeNull(),
    );
    const container = viewer.shadowRoot?.querySelector(
      "wzc-review-media-dialog",
    ) as ReviewMediaDialog;
    await container.updateComplete;
    const information = container.shadowRoot?.querySelector(
      "wzc-recorded-media-information",
    ) as LitElement;
    await information.updateComplete;

    expect(information.shadowRoot?.textContent).toContain("Front door");
    expect(information.shadowRoot?.textContent).toContain("0:20");
    expect(information.shadowRoot?.textContent).toContain("Delivery driver");
    expect(information.shadowRoot?.textContent).toContain("92%");
    const badges = [
      ...(information.shadowRoot?.querySelectorAll("wzc-badge") ?? []),
    ];
    expect(badges.map((badge) => badge.textContent?.trim())).toEqual([
      "Person",
      "Delivery driver",
      "Alert",
    ]);
    expect(
      badges.map((badge) => ({
        appearance: badge.getAttribute("appearance"),
        shape: badge.getAttribute("shape"),
        size: badge.getAttribute("size"),
      })),
    ).toEqual([
      { appearance: "filled", shape: "pill", size: "small" },
      { appearance: "filled", shape: "pill", size: "small" },
      { appearance: "filled", shape: "pill", size: "small" },
    ]);
    const viewReviewButton =
      container.shadowRoot?.querySelector<HTMLButtonElement>(
        'button[aria-label="View Review"]',
      );
    expect(viewReviewButton?.textContent?.trim()).toBe("");
    viewReviewButton?.click();

    await vi.waitFor(() =>
      expect(
        container.shadowRoot?.querySelector("wzc-recorded-video-player"),
      ).not.toBeNull(),
    );
    expect(viewReview).toHaveBeenCalledOnce();
    await information.updateComplete;
    const viewSnapshotButton =
      container.shadowRoot?.querySelector<HTMLButtonElement>(
        'button[aria-label="View Snapshot"]',
      );
    expect(
      [
        ...(container.shadowRoot?.querySelectorAll(".footer-actions button") ??
          []),
      ].map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Export review", "Download Review", "View Snapshot"]);
    viewSnapshotButton?.click();
    await vi.waitFor(() =>
      expect(
        container.shadowRoot?.querySelector("img.snapshot"),
      ).not.toBeNull(),
    );
    expect(viewReview).toHaveBeenCalledOnce();
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
        viewer.shadowRoot?.querySelector("wzc-review-media-dialog"),
      ).not.toBeNull(),
    );
    const container = viewer.shadowRoot?.querySelector(
      "wzc-review-media-dialog",
    ) as ReviewMediaDialog;
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
