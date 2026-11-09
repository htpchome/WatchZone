import { afterEach, describe, expect, it, vi } from "vitest";

import { listActivityWindow } from "../src/api/activity-window";
import type { HomeAssistantApi } from "../src/core/home-assistant";

describe("activity window pagination", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retrieves every page in the configured history window", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      id: `item-${index}`,
      start_time: 1_000 - index,
    }));
    const finalItem = { id: "item-500", start_time: 500 };
    const callWS = vi
      .fn()
      .mockResolvedValueOnce({ items: firstPage })
      .mockResolvedValueOnce({ items: [finalItem] });
    const api = { callWS } as unknown as HomeAssistantApi;

    const items = await listActivityWindow(
      api,
      "camera.front",
      "watchzone/events/list",
      { historyDays: 1 },
    );

    expect(items).toHaveLength(501);
    expect(items.at(-1)).toEqual(finalItem);
    expect(callWS).toHaveBeenCalledTimes(2);
    expect(callWS.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        before: 501,
        entity_id: "camera.front",
        limit: 500,
        type: "watchzone/events/list",
      }),
    );
  });
});
