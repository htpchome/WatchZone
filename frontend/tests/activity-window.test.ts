import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVITY_INITIAL_PAGE_SIZE,
  ACTIVITY_OLDER_PAGE_SIZE,
  listActivityWindow,
} from "../src/api/activity-window";
import type { HomeAssistantApi } from "../src/core/home-assistant";

describe("activity window pagination", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns one bounded initial page and its continuation cursor", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const items = Array.from(
      { length: ACTIVITY_INITIAL_PAGE_SIZE },
      (_, index) => ({ id: `item-${index}`, start_time: 1_000 - index }),
    );
    const callWS = vi.fn().mockResolvedValue({ items });
    const api = { callWS } as unknown as HomeAssistantApi;

    const page = await listActivityWindow(
      api,
      "camera.front",
      "camera_optics/events/list",
      { historyDays: 1 },
    );

    expect(page).toEqual({ hasMore: true, items, nextBefore: 991 });
    expect(callWS).toHaveBeenCalledOnce();
    expect(callWS).toHaveBeenCalledWith(
      expect.objectContaining({ limit: ACTIVITY_INITIAL_PAGE_SIZE }),
    );
  });

  it("requests one older review page from the supplied cursor", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const items = Array.from(
      { length: ACTIVITY_OLDER_PAGE_SIZE },
      (_, index) => ({ id: `item-${index}`, start_time: 990 - index }),
    );
    const callWS = vi.fn().mockResolvedValue({ items });
    const api = { callWS } as unknown as HomeAssistantApi;

    const page = await listActivityWindow(
      api,
      "camera.front",
      "camera_optics/reviews/list",
      {
        before: 991,
        historyDays: 1,
        limit: ACTIVITY_OLDER_PAGE_SIZE,
      },
    );

    expect(page.hasMore).toBe(true);
    expect(page.nextBefore).toBe(941);
    expect(callWS).toHaveBeenCalledWith(
      expect.objectContaining({
        before: 991,
        limit: ACTIVITY_OLDER_PAGE_SIZE,
        summary_only: false,
      }),
    );
  });

  it("stops pagination when a provider returns a partial page", async () => {
    const item = { id: "only-item", start_time: Date.now() / 1000 - 1 };
    const api = {
      callWS: vi.fn().mockResolvedValue({ items: [item] }),
    } as unknown as HomeAssistantApi;

    await expect(
      listActivityWindow(api, "camera.front", "camera_optics/events/list", {
        historyDays: 1,
      }),
    ).resolves.toEqual({ hasMore: false, items: [item] });
  });
});
