import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventItem } from "../src/api/events";
import type { ReviewItem } from "../src/api/reviews";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { ActivityUpdateNotification } from "../src/providers/activity-update-resolver";

const mocks = vi.hoisted(() => ({
  findEvent: vi.fn(),
  findReview: vi.fn(),
  updateCallback: undefined as
    ((notification: ActivityUpdateNotification) => void) | undefined,
}));

vi.mock("../src/features/deep-links/activity-lookup", () => ({
  findEvent: mocks.findEvent,
  findReview: mocks.findReview,
}));
vi.mock("../src/providers/activity-update-resolver", () => ({
  subscribeActivityUpdates: vi.fn(
    async (
      _api: HomeAssistantApi,
      _entityId: string,
      _kind: string,
      callback: (notification: ActivityUpdateNotification) => void,
    ) => {
      mocks.updateCallback = callback;
      return () => undefined;
    },
  ),
}));

import { ActivityDeepLinkResolver } from "../src/features/deep-links/resolver";

const api = {
  identity: {},
  locale: { language: "en" },
  resolveUrl: (url: string) => `https://ha.local${url}`,
} as unknown as HomeAssistantApi;

function event(overrides: Partial<EventItem> = {}): EventItem {
  return {
    camera: "front",
    clip_url: "/event.mp4",
    end_time: 20,
    has_clip: true,
    has_snapshot: true,
    id: "instance:event-1",
    label: "person",
    playback_sources: [
      { content_type: "video/mp4", transport: "file", url: "/event.mp4" },
    ],
    preferred_transport: "file",
    revision: "event-revision",
    snapshot_url: "/event.jpg",
    start_time: 10,
    sub_label: null,
    thumbnail_url: "/event-thumb.jpg",
    zones: [],
    ...overrides,
  };
}

function review(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    camera: "front",
    classification: "alert",
    clip_url: "/review.mp4",
    end_time: 20,
    id: "instance:review-1",
    labels: ["person"],
    media_end_time: 25,
    media_start_time: 5,
    playback_sources: [
      { content_type: "video/mp4", transport: "file", url: "/review.mp4" },
    ],
    preferred_transport: "file",
    preview_url: null,
    related_event_ids: ["instance:event-1"],
    reviewed: false,
    revision: "review-revision",
    snapshot_url: "/review.jpg",
    start_time: 10,
    sub_labels: [],
    thumbnail_url: "/review-thumb.jpg",
    zones: [],
    ...overrides,
  };
}

describe("activity deep-link resolution", () => {
  beforeEach(() => {
    mocks.findEvent.mockReset();
    mocks.findReview.mockReset();
    mocks.updateCallback = undefined;
  });

  it("gives an explicit event precedence over its review", async () => {
    mocks.findEvent.mockResolvedValue(event());
    mocks.findReview.mockResolvedValue(review());
    const onOpen = vi.fn();
    new ActivityDeepLinkResolver({
      api,
      cameraEntityId: "camera.front",
      eventId: "event-1",
      historyDays: 5,
      media: "video",
      onOpen,
      reviewId: "review-1",
    }).start();

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledOnce());
    expect(onOpen.mock.calls[0]?.[0]).toMatchObject({
      id: "instance:event-1",
      kind: "video",
    });
    expect(mocks.findReview).not.toHaveBeenCalled();
  });

  it("falls forward once to the review when the event is unavailable", async () => {
    mocks.findEvent.mockResolvedValue(undefined);
    mocks.findReview.mockResolvedValue(review());
    const onOpen = vi.fn();
    new ActivityDeepLinkResolver({
      api,
      cameraEntityId: "camera.front",
      eventId: "event-1",
      historyDays: 5,
      media: "snapshot",
      onOpen,
      reviewId: "review-1",
    }).start();

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledOnce());
    expect(mocks.findEvent).toHaveBeenCalledOnce();
    expect(mocks.findReview).toHaveBeenCalledOnce();
    expect(onOpen.mock.calls[0]?.[0]).toMatchObject({
      id: "instance:review-1:snapshot",
      kind: "snapshot",
    });
  });

  it("keeps a draft review pending until requested media is available", async () => {
    const draft = review({ playback_sources: [], snapshot_url: null });
    mocks.findReview.mockResolvedValueOnce(draft);
    const onOpen = vi.fn();
    const resolver = new ActivityDeepLinkResolver({
      api,
      cameraEntityId: "camera.front",
      historyDays: 5,
      media: "video",
      onOpen,
      reviewId: "review-1",
    });
    resolver.start();
    await vi.waitFor(() => expect(mocks.findReview).toHaveBeenCalledOnce());
    expect(onOpen).not.toHaveBeenCalled();

    mocks.findReview.mockResolvedValue(review());
    mocks.updateCallback?.({
      cameraName: "front",
      id: "review-1",
      phase: "end",
      topic: "reviews",
    });

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledOnce());
    expect(mocks.findEvent).not.toHaveBeenCalled();
  });
});
