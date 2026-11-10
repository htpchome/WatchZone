import { afterEach, describe, expect, it, vi } from "vitest";
import type { LitElement } from "lit";

import { CameraSelectionContext } from "../src/stage/camera-selection-context";
import { ActivityFilterContext } from "../src/stage/activity";
import { MediaDateContext } from "../src/stage/media-date-context";
import { ACTIVITY_LIST_TAG, REVIEWS_TAG } from "../src/core/constants";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { ReviewsModule } from "../src/stage/modules/reviews/reviews";
import "../src/stage/modules/reviews/reviews";

vi.mock("../src/api/activity-updates", () => ({
  resolveActivityUpdateSource: vi.fn().mockResolvedValue({
    type: "frigate",
    instance_id: "frigate-main",
    camera_name: "front",
  }),
}));

const reviews = [
  {
    analysis_description:
      "The resident enters the garage and approaches the red car.",
    analysis_title: "Resident entering garage",
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
    preview_url: "/review-1-preview.gif",
    revision: "revision-1",
    related_event_ids: ["frigate:event-1", "frigate:event-2"],
    reviewed: true,
    snapshot_url: "/alert-snapshot.jpg",
    start_time: 100,
    sub_labels: ["Resident", "Northern Mockingbird", "American Goldfinch"],
    thumbnail_url: "/alert.webp",
    zones: ["driveway"],
  },
  {
    analysis_description: null,
    analysis_title: null,
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
    preview_url: "/review-2-preview.gif",
    revision: "revision-2",
    related_event_ids: ["frigate:event-3"],
    reviewed: false,
    snapshot_url: null,
    start_time: 80,
    sub_labels: [],
    thumbnail_url: "/detection.webp",
    zones: [],
  },
] as const;

describe("reviews module", () => {
  HTMLDialogElement.prototype.showModal ??= function (): void {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (): void {
    this.removeAttribute("open");
  };

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
    const filterContext = new ActivityFilterContext();
    const dateContext = new MediaDateContext();
    const module = document.createElement(REVIEWS_TAG) as ReviewsModule;
    module.api = api;
    module.activityFilter = filterContext;
    module.mediaDate = dateContext;
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
    const list = module.shadowRoot?.querySelector(ACTIVITY_LIST_TAG) as
      | (HTMLElement & {
          items: readonly { hoverPreviewUrl?: string | null }[];
          updateComplete: Promise<boolean>;
        })
      | null;
    expect(list?.items[0]?.hoverPreviewUrl).toBe("/review-1-preview.gif");
    module.hoverPreviewEnabled = false;
    await module.updateComplete;
    expect(list?.items[0]?.hoverPreviewUrl).toBeNull();
    module.shadows = false;
    await module.updateComplete;
    await list?.updateComplete;
    expect(
      activityRoot(module)
        ?.querySelector(".viewport")
        ?.classList.contains("no-shadows"),
    ).toBe(true);
    expect(activityRoot(module)?.querySelector(".duration")?.textContent).toBe(
      "34s",
    );
    dateContext.select("camera.front", "1970-01-02");
    await module.updateComplete;
    expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(0);
    dateContext.reset("camera.front");
    await module.updateComplete;
    expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(2);
    filterContext.setClassification("camera.front", "alert");
    await module.updateComplete;
    expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(1);
    filterContext.setClassification("camera.front", "all");
    filterContext.toggleLabel("camera.front", "cat");
    await module.updateComplete;
    expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(1);
    filterContext.clearLabels("camera.front");
    filterContext.setReviewStatus("camera.front", "reviewed");
    await module.updateComplete;
    expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(1);
    filterContext.setReviewStatus("camera.front", "all");
    filterContext.toggleZone("camera.front", "driveway");
    await module.updateComplete;
    expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(1);
    filterContext.resetFilters("camera.front");
    await module.updateComplete;
    expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(2);
  });

  it("opens generated analysis for reviews with complete metadata", async () => {
    const api = {
      callWS: vi.fn().mockResolvedValue({ items: reviews }),
      identity: {},
      locale: { language: "en", time_zone: "server" },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    const selection = new CameraSelectionContext();
    const module = document.createElement(REVIEWS_TAG) as ReviewsModule;
    module.api = api;
    module.cameraSelection = selection;
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
      expect(
        activityRoot(module)?.querySelectorAll(".analysis-title"),
      ).toHaveLength(1);
    });
    const analysisButton =
      activityRoot(module)?.querySelector<HTMLButtonElement>(".analysis-title");
    expect(analysisButton?.textContent).toContain("Resident entering garage");
    expect(analysisButton?.querySelector("ha-icon")?.getAttribute("icon")).toBe(
      "mdi:creation",
    );
    analysisButton?.click();
    await module.updateComplete;

    const analysisDialog = module.shadowRoot?.querySelector(
      "wzc-review-analysis-dialog",
    );
    await (analysisDialog as LitElement | null)?.updateComplete;
    const dialog = analysisDialog?.shadowRoot?.querySelector("dialog");
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(dialog?.textContent).toContain("AI Analysis");
    expect(dialog?.textContent).toContain(
      "The resident enters the garage and approaches the red car.",
    );
  });

  it("toggles reviewed state through the normalized reviews API", async () => {
    const callWS = vi.fn(async (message: { type: string }) =>
      message.type === "watchzone/reviews/list"
        ? { items: reviews }
        : { reviewed: true },
    );
    const api = {
      callWS,
      identity: {},
      locale: { language: "en", time_zone: "server" },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    const selection = new CameraSelectionContext();
    const module = document.createElement(REVIEWS_TAG) as ReviewsModule;
    module.api = api;
    module.cameraSelection = selection;
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
      expect(
        activityRoot(module)?.querySelectorAll(".review-state"),
      ).toHaveLength(2);
    });
    const unreviewed = activityRoot(module)?.querySelector<HTMLButtonElement>(
      'button[aria-label="Mark reviewed"]',
    );
    unreviewed?.click();

    await vi.waitFor(() => {
      expect(callWS).toHaveBeenCalledWith({
        type: "watchzone/reviews/set_reviewed",
        entity_id: "camera.front",
        review_id: "frigate:review-2",
        reviewed: true,
      });
      expect(
        activityRoot(module)?.querySelectorAll(".review-state.reviewed"),
      ).toHaveLength(2);
    });
  });

  it("replaces one review tile through new, update, and end notifications", async () => {
    const startTime = Date.now() / 1000;
    const callWS = vi.fn().mockResolvedValue({ items: [] });
    let reviewUpdate: ((payload: unknown) => void) | undefined;
    const api = {
      callWS,
      identity: {},
      locale: { language: "en", time_zone: "server" },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(async (callback, message: { type: string }) => {
        if (message.type === "frigate/reviews/subscribe") {
          reviewUpdate = callback as (payload: unknown) => void;
        }
        return () => undefined;
      }),
    } as unknown as HomeAssistantApi;
    const selection = new CameraSelectionContext();
    const module = document.createElement(REVIEWS_TAG) as ReviewsModule;
    module.api = api;
    module.cameraSelection = selection;
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

    await vi.waitFor(() => expect(reviewUpdate).toBeTypeOf("function"));
    reviewUpdate?.(
      JSON.stringify({
        type: "new",
        after: {
          camera: "front",
          data: { objects: ["person"] },
          id: "review-live",
          severity: "detection",
          start_time: startTime,
        },
      }),
    );
    await vi.waitFor(() => {
      expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(1);
      expect(
        activityRoot(module)?.querySelector(".thumbnail-wrap.detection"),
      ).not.toBeNull();
    });

    reviewUpdate?.(
      JSON.stringify({
        type: "update",
        after: {
          camera: "front",
          data: { objects: ["person", "package"] },
          id: "review-live",
          severity: "alert",
          start_time: startTime,
        },
      }),
    );
    await vi.waitFor(() => {
      expect(
        [...(activityRoot(module)?.querySelectorAll("wzc-badge") ?? [])].map(
          ({ textContent }) => textContent?.trim(),
        ),
      ).toContain("Package");
      expect(
        activityRoot(module)?.querySelector(".thumbnail-wrap.alert"),
      ).not.toBeNull();
    });

    reviewUpdate?.(
      JSON.stringify({
        type: "end",
        after: {
          camera: "front",
          data: { objects: ["person", "package"] },
          end_time: startTime + 10,
          id: "review-live",
          severity: "alert",
          start_time: startTime,
        },
      }),
    );
    await vi.waitFor(() => {
      expect(
        activityRoot(module)?.querySelector(".duration")?.textContent,
      ).toBe("10s");
    });
    module.remove();
  });
});

function activityRoot(module: ReviewsModule): ShadowRoot | null | undefined {
  return module.shadowRoot?.querySelector(ACTIVITY_LIST_TAG)?.shadowRoot;
}
