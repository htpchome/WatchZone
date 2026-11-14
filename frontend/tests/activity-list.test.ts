import { afterEach, describe, expect, it } from "vitest";

import {
  ACTIVITY_LIST_INTENT_EVENT,
  ACTIVITY_LIST_TAG,
} from "../src/core/constants";
import type {
  ActivityList,
  ActivityListIntent,
  ActivityListItem,
} from "../src/ui/activity-list";
import "../src/ui/activity-list";

function item(revision: string): ActivityListItem {
  return {
    cameraLabel: "Front",
    classification: "alert",
    clipUrl: "/review.mp4",
    endTime: null,
    id: "review-1",
    inProgress: true,
    objectLabels: ["person"],
    playbackSources: [],
    playable: true,
    preferredTransport: "file",
    revision,
    snapshotUrl: "/snapshot.jpg?v=active",
    startTime: 100,
    thumbnailUrl: "/thumbnail.webp?v=active",
    zones: [],
  };
}

describe("activity list media failures", () => {
  afterEach(() => document.body.replaceChildren());

  it("does not retry or flash the same failed media across metadata revisions", async () => {
    const list = document.createElement(ACTIVITY_LIST_TAG) as ActivityList;
    const retries: ActivityListIntent[] = [];
    list.addEventListener(ACTIVITY_LIST_INTENT_EVENT, (event) => {
      const detail = (event as CustomEvent<ActivityListIntent>).detail;
      if (detail.kind === "retry_media") retries.push(detail);
    });
    list.items = [item("revision-1")];
    document.body.append(list);
    await list.updateComplete;

    const thumbnail = list.shadowRoot?.querySelector<HTMLImageElement>(
      'img[src="/thumbnail.webp?v=active"]',
    );
    expect(thumbnail).not.toBeNull();
    thumbnail?.dispatchEvent(new Event("error"));
    expect(thumbnail?.hidden).toBe(true);
    await list.updateComplete;

    expect(
      list.shadowRoot?.querySelector<HTMLImageElement>(
        'img[src="/snapshot.jpg?v=active"]',
      ),
    ).not.toBeNull();

    list.items = [item("revision-2")];
    await list.updateComplete;
    expect(
      list.shadowRoot?.querySelector<HTMLImageElement>(
        'img[src="/thumbnail.webp?v=active"]',
      ),
    ).toBeNull();

    const snapshot = list.shadowRoot?.querySelector<HTMLImageElement>(
      'img[src="/snapshot.jpg?v=active"]',
    );
    snapshot?.dispatchEvent(new Event("error"));
    expect(snapshot?.hidden).toBe(true);
    await list.updateComplete;
    expect(list.shadowRoot?.querySelector(".placeholder")).not.toBeNull();

    list.items = [item("revision-3")];
    await list.updateComplete;
    expect(list.shadowRoot?.querySelector(".thumbnail")).toBeNull();
    expect(retries).toHaveLength(2);
  });
});
