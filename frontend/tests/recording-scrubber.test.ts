import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RECORDING_SCRUBBER_EVENT,
  RECORDING_SCRUBBER_TAG,
} from "../src/core/constants";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { RecordingTimeline } from "../src/core/recorded-media";
import type {
  RecordingScrubber,
  RecordingScrubberEventDetail,
} from "../src/features/media-viewer/recording-scrubber";
import { RecordingSegmentController } from "../src/features/media-viewer/recording-segment.controller";
import "../src/features/media-viewer/recording-scrubber";

const start = Date.UTC(2026, 10, 10, 14) / 1000;
const timeline: RecordingTimeline = {
  availableEndTime: start + 3600,
  availableStartTime: start,
  camera: "front",
  entityId: "camera.front",
  startTime: start,
  endTime: start + 3600,
  spans: [
    { startTime: start, endTime: start + 600, mediaOffset: 0 },
    { startTime: start + 1200, endTime: start + 3600, mediaOffset: 600 },
  ],
  markers: [
    {
      classification: "detection",
      endTime: start + 1020,
      id: "review-1",
      startTime: start + 900,
      thumbnailUrl: "/review-1.webp",
    },
  ],
  selectionEndTime: start + 3780,
  selectionSpans: [
    { startTime: start - 120, endTime: start + 600 },
    { startTime: start + 1200, endTime: start + 3780 },
  ],
  selectionStartTime: start - 120,
};

describe("recording scrubber", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders clock ticks, playable spans, gaps, markers, and the seek pointer", async () => {
    const scrubber = document.createElement(
      RECORDING_SCRUBBER_TAG,
    ) as RecordingScrubber;
    scrubber.api = {
      locale: { language: "en", time_format: "12", time_zone: "UTC" },
      resolveUrl: (path: string) => `https://ha.local${path}`,
    } as HomeAssistantApi;
    scrubber.timeline = timeline;
    scrubber.currentTimestamp = start + 1800;
    document.body.append(scrubber);
    await scrubber.updateComplete;

    expect(scrubber.shadowRoot?.querySelectorAll(".span")).toHaveLength(2);
    expect(scrubber.shadowRoot?.querySelectorAll(".tick")).toHaveLength(7);
    expect(
      [...(scrubber.shadowRoot?.querySelectorAll(".label") ?? [])].map(
        (label) => label.textContent,
      ),
    ).toEqual(["2:00", "2:10", "2:20", "2:30", "2:40", "2:50", "3:00"]);
    expect(
      scrubber.shadowRoot?.querySelector(".pointer-time")?.textContent,
    ).toBe("2:30:00");
    const marker =
      scrubber.shadowRoot?.querySelector<HTMLButtonElement>(
        ".marker.detection",
      );
    marker?.dispatchEvent(new PointerEvent("pointerenter"));
    await scrubber.updateComplete;
    expect(scrubber.shadowRoot?.querySelector(".preview img")).toMatchObject({
      src: "https://ha.local/review-1.webp",
    });
    expect(
      scrubber.shadowRoot?.querySelector(".preview-label")?.textContent,
    ).toContain("Detection - 2:15");
  });

  it("seeks and starts playback when an activity marker is activated", async () => {
    const scrubber = document.createElement(
      RECORDING_SCRUBBER_TAG,
    ) as RecordingScrubber;
    scrubber.timeline = timeline;
    document.body.append(scrubber);
    await scrubber.updateComplete;
    const actions: RecordingScrubberEventDetail[] = [];
    scrubber.addEventListener(RECORDING_SCRUBBER_EVENT, (event) => {
      actions.push((event as CustomEvent<RecordingScrubberEventDetail>).detail);
    });

    scrubber.shadowRoot?.querySelector<HTMLButtonElement>(".marker")?.click();

    expect(actions).toEqual([
      { action: "seek_and_play", timestamp: start + 900 },
    ]);
  });

  it("activates second-precise segment handles with keyboard adjustment", async () => {
    const scrubber = document.createElement(
      RECORDING_SCRUBBER_TAG,
    ) as RecordingScrubber;
    scrubber.api = {
      locale: { language: "en", time_format: "12", time_zone: "UTC" },
    } as HomeAssistantApi;
    scrubber.timeline = timeline;
    document.body.append(scrubber);
    await scrubber.updateComplete;
    const actions: RecordingScrubberEventDetail[] = [];
    scrubber.addEventListener(RECORDING_SCRUBBER_EVENT, (event) => {
      actions.push((event as CustomEvent<RecordingScrubberEventDetail>).detail);
    });

    scrubber.shadowRoot
      ?.querySelector<HTMLButtonElement>(".segment-toggle")
      ?.click();
    expect(actions).toEqual([{ action: "toggle_segment" }]);

    scrubber.segmentActive = true;
    scrubber.segmentSelection = {
      startTime: start - 120,
      endTime: start + 3780,
    };
    await scrubber.updateComplete;

    scrubber.shadowRoot
      ?.querySelector<HTMLButtonElement>(".segment-toggle")
      ?.click();
    expect(actions.at(-1)).toEqual({ action: "toggle_segment" });

    expect(scrubber.shadowRoot?.querySelectorAll(".context")).toHaveLength(2);
    expect(scrubber.shadowRoot?.querySelectorAll(".handle")).toHaveLength(2);
    const startHandle =
      scrubber.shadowRoot?.querySelector<HTMLButtonElement>(".handle.start");
    expect(startHandle?.getAttribute("aria-valuemin")).toBe(
      String(start - 120),
    );
    expect(startHandle?.getAttribute("aria-valuetext")).toBe("1:58:00");
    startHandle?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(actions.at(-1)).toEqual({
      action: "set_segment_start",
      timestamp: start - 119,
    });
  });

  it("allows selection across missing spans while retaining outer bounds", () => {
    const controller = new RecordingSegmentController(
      () => undefined,
      () => undefined,
      () => undefined,
    );
    controller.configure(timeline);
    controller.setStart(start + 900, timeline);
    expect(controller.selection?.startTime).toBe(start + 900);

    controller.reset(timeline);
    controller.setEnd(start + 900, timeline);
    expect(controller.selection?.endTime).toBe(start + 900);
  });

  it("initializes selection at the actual outer recording bounds", () => {
    const controller = new RecordingSegmentController(
      () => undefined,
      () => undefined,
      () => undefined,
    );
    controller.configure({
      ...timeline,
      availableEndTime: start + 1620,
    });

    expect(controller.selection).toEqual({
      startTime: start,
      endTime: start + 1620,
    });
  });
});
