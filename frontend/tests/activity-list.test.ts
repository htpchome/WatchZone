import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("clears stale Top visibility when a retained list reconnects at the beginning", async () => {
    const list = document.createElement(ACTIVITY_LIST_TAG) as ActivityList;
    list.items = Array.from({ length: 4 }, (_, index) => ({
      ...item(`scroll-${index}`),
      id: `review-${index}`,
      startTime: 100 - index,
    }));
    document.body.append(list);
    await list.updateComplete;
    const scroller = list.shadowRoot?.querySelector<HTMLElement>(".scroller");
    if (!scroller) throw new Error("Expected activity scroller.");
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 800 },
      scrollTop: { configurable: true, value: 200, writable: true },
    });
    const tile = scroller.querySelector<HTMLElement>(".tile");
    if (!tile) throw new Error("Expected activity tile.");
    tile.getBoundingClientRect = () => ({ height: 80 }) as DOMRect;
    scroller.dispatchEvent(new Event("scroll"));
    await list.updateComplete;
    expect(
      list.shadowRoot?.querySelector("wzc-scroll-top")?.hasAttribute("hidden"),
    ).toBe(false);

    list.remove();
    scroller.scrollTop = 0;
    document.body.append(list);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await list.updateComplete;

    expect(
      list.shadowRoot?.querySelector("wzc-scroll-top")?.hasAttribute("hidden"),
    ).toBe(true);
  });

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

  it("renders one badge lane with a terminal overflow summary", async () => {
    const list = document.createElement(ACTIVITY_LIST_TAG) as ActivityList;
    list.items = [
      {
        ...item("badge-layout"),
        cameraBadgeLabel: "Front",
        objectLabels: ["one", "two", "three", "four", "five", "six"],
        typeBadge: { label: "alert", variant: "danger" },
      },
    ];
    document.body.append(list);
    await list.updateComplete;

    expect(
      list.shadowRoot?.querySelectorAll(".badges wzc-badge[data-badge-index]"),
    ).toHaveLength(8);
    expect(
      list.shadowRoot?.querySelector(".badges .badge-summary[hidden]"),
    ).not.toBeNull();
  });

  it("requests one older page when scrolling near the loaded boundary", async () => {
    const list = document.createElement(ACTIVITY_LIST_TAG) as ActivityList;
    const intents: ActivityListIntent[] = [];
    list.addEventListener(ACTIVITY_LIST_INTENT_EVENT, (event) => {
      intents.push((event as CustomEvent<ActivityListIntent>).detail);
    });
    list.hasMore = true;
    list.items = [item("progressive")];
    document.body.append(list);
    await list.updateComplete;

    const scroller = list.shadowRoot?.querySelector<HTMLElement>(".scroller");
    expect(scroller).not.toBeNull();
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 750, writable: true },
    });
    scroller?.dispatchEvent(new Event("scroll"));

    expect(intents).toContainEqual({ kind: "load_more" });
    scroller?.dispatchEvent(new Event("scroll"));
    expect(intents.filter(({ kind }) => kind === "load_more")).toHaveLength(1);
  });

  it("returns reviews and events to the top of their shared list", async () => {
    const list = document.createElement(ACTIVITY_LIST_TAG) as ActivityList;
    list.items = [item("top-control")];
    document.body.append(list);
    await list.updateComplete;
    const scroller = list.shadowRoot?.querySelector<HTMLElement>(".scroller");
    if (!scroller) throw new Error("Expected activity scroller.");
    scroller.scrollTop = 750;
    const scrollTo = vi.fn((options: ScrollToOptions) => {
      scroller.scrollTop = options.top ?? scroller.scrollTop;
    });
    scroller.scrollTo = scrollTo as typeof scroller.scrollTo;

    list.shadowRoot
      ?.querySelector("wzc-scroll-top")
      ?.shadowRoot?.querySelector<HTMLButtonElement>('button[aria-label="Top"]')
      ?.click();

    expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", top: 0 });
    expect(scroller.scrollTop).toBe(0);
  });

  it("keeps the visible tile anchored when a merged page inserts above it", async () => {
    const list = document.createElement(ACTIVITY_LIST_TAG) as ActivityList;
    const existing = { ...item("existing"), id: "existing" };
    list.items = [existing];
    document.body.append(list);
    await list.updateComplete;

    const scroller = list.shadowRoot?.querySelector<HTMLElement>(".scroller");
    const existingTile = list.shadowRoot?.querySelector<HTMLElement>(
      '[data-activity-id="existing"]',
    );
    expect(scroller).not.toBeNull();
    expect(existingTile).not.toBeNull();
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      value: 100,
      writable: true,
    });
    vi.spyOn(scroller!, "getBoundingClientRect").mockReturnValue(rect(0, 200));
    vi.spyOn(existingTile!, "getBoundingClientRect").mockImplementation(() =>
      list.shadowRoot?.querySelectorAll(".tile").length === 1
        ? rect(10, 60)
        : rect(60, 110),
    );

    list.items = [
      { ...item("inserted"), id: "inserted", startTime: 101 },
      existing,
    ];
    await list.updateComplete;

    expect(scroller?.scrollTop).toBe(150);
  });

  it("reserves scroll space for indexed rows that are not loaded yet", async () => {
    const list = document.createElement(ACTIVITY_LIST_TAG) as ActivityList;
    list.estimatedDayCount = 3;
    list.estimatedItemCount = 100;
    list.items = [{ ...item("first"), id: "first" }];
    document.body.append(list);
    await list.updateComplete;

    expect(
      list.shadowRoot?.querySelector<HTMLElement>(".unloaded-space")?.style
        .blockSize,
    ).toContain("99 *");

    list.items = [
      { ...item("first"), id: "first" },
      { ...item("second"), id: "second" },
    ];
    await list.updateComplete;
    expect(
      list.shadowRoot?.querySelector<HTMLElement>(".unloaded-space")?.style
        .blockSize,
    ).toContain("98 *");
  });
});

function rect(top: number, bottom: number): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 100,
    top,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}
