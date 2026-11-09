import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraSelectionContext } from "../src/stage/camera-selection-context";
import { ActivityDateFilterContext } from "../src/stage/activity";
import { ACTIVITY_LIST_TAG, ALERTS_TAG } from "../src/core/constants";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { AlertsModule } from "../src/stage/modules/alerts/alerts";
import "../src/stage/modules/alerts/alerts";

const reviews = [
  {
    camera: "front",
    classification: "alert",
    clip_url: "/alert.mp4",
    end_time: 124,
    id: "frigate:review-1",
    labels: ["person", "bird"],
    media_end_time: 129,
    media_start_time: 95,
    playback_sources: [
      { content_type: "video/mp4", transport: "file", url: "/alert.mp4" },
    ],
    preferred_transport: "hls",
    revision: "revision-1",
    related_event_ids: ["frigate:event-1", "frigate:event-2"],
    snapshot_url: "/alert-snapshot.jpg",
    start_time: 100,
    sub_labels: ["Resident", "Northern Mockingbird", "American Goldfinch"],
    thumbnail_url: "/alert.webp",
    zones: ["driveway"],
  },
  {
    camera: "front",
    classification: "detection",
    clip_url: "/detection.mp4",
    end_time: 90,
    id: "frigate:review-2",
    labels: ["cat"],
    media_end_time: 95,
    media_start_time: 75,
    playback_sources: [
      {
        content_type: "application/vnd.apple.mpegurl",
        transport: "hls",
        url: "/detection.m3u8",
      },
    ],
    preferred_transport: "hls",
    revision: "revision-2",
    related_event_ids: ["frigate:event-3"],
    snapshot_url: null,
    start_time: 80,
    sub_labels: [],
    thumbnail_url: "/detection.webp",
    zones: [],
  },
] as const;

describe("alerts module", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("presents alert and detection review activity", async () => {
    const callWS = vi.fn().mockResolvedValue({ items: reviews });
    const api = {
      callWS,
      identity: {},
      locale: { language: "en", time_zone: "server" },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    const selection = new CameraSelectionContext();
    const dateFilter = new ActivityDateFilterContext();
    const module = document.createElement(ALERTS_TAG) as AlertsModule;
    module.api = api;
    module.activityDateFilter = dateFilter;
    module.cameraSelection = selection;
    module.historyDays = 5;
    module.targetModuleId = "camera-module";
    document.body.append(module);
    selection.publish(
      "camera-module",
      {},
      {
        activeEntityId: "camera.front",
        items: [{ entityId: "camera.front", label: "Front" }],
      },
      vi.fn(),
    );

    await vi.waitFor(() => {
      expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(2);
    });
    expect(callWS).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "watchzone/reviews/list",
        entity_id: "camera.front",
        limit: 10,
      }),
    );
    expect(
      [...(activityRoot(module)?.querySelectorAll("wzc-badge") ?? [])].map(
        ({ textContent }) => textContent?.trim(),
      ),
    ).toEqual([
      "Person",
      "Bird",
      "Resident",
      "Northern Mockingbird",
      "American Goldfinch",
      "Alert",
      "Cat",
      "Detection",
    ]);
    expect(
      activityRoot(module)?.querySelectorAll(".thumbnail-wrap.alert"),
    ).toHaveLength(1);
    expect(
      activityRoot(module)?.querySelectorAll(".thumbnail-wrap.detection"),
    ).toHaveLength(1);
    expect(
      activityRoot(module)?.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="View snapshot"]',
      ),
    ).toHaveLength(1);
    expect(activityRoot(module)?.querySelector(".duration")?.textContent).toBe(
      "34s",
    );
    dateFilter.select("1970-01-02");
    await module.updateComplete;
    expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(0);
    dateFilter.reset();
    await module.updateComplete;
    expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(2);
  });
});

function activityRoot(module: AlertsModule): ShadowRoot | null | undefined {
  return module.shadowRoot?.querySelector(ACTIVITY_LIST_TAG)?.shadowRoot;
}
