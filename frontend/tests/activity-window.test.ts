import { afterEach, describe, expect, it, vi } from "vitest";

import { listActivityWindow } from "../src/api/activity-window";
import type { HomeAssistantApi } from "../src/core/home-assistant";

describe("activity window pagination", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retrieves every page in the configured history window", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const firstPage = Array.from({ length: 10 }, (_, index) => ({
      id: `item-${index}`,
      start_time: 1_000 - index,
    }));
    const backgroundPage = Array.from({ length: 500 }, (_, index) => ({
      id: `item-${index + 10}`,
      start_time: 990 - index,
    }));
    const finalItem = { id: "item-510", start_time: 490 };
    const progress: number[] = [];
    const callWS = vi
      .fn()
      .mockResolvedValueOnce({ items: firstPage })
      .mockResolvedValueOnce({ items: backgroundPage })
      .mockResolvedValueOnce({ items: [finalItem] });
    const api = { callWS } as unknown as HomeAssistantApi;

    const items = await listActivityWindow(
      api,
      "camera.front",
      "watchzone/events/list",
      { historyDays: 1, onProgress: (page) => progress.push(page.length) },
    );

    expect(items).toHaveLength(511);
    expect(items.at(-1)).toEqual(finalItem);
    expect(progress).toEqual([10, 510, 511]);
    expect(callWS).toHaveBeenCalledTimes(3);
    expect(callWS.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ limit: 10 }),
    );
    expect(callWS.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        before: 991,
        entity_id: "camera.front",
        limit: 500,
        type: "watchzone/events/list",
      }),
    );
  });

  it("publishes the first ten items before background history completes", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    let finishBackground:
      ((value: { items: readonly never[] }) => void) | undefined;
    const background = new Promise<{ items: readonly never[] }>((resolve) => {
      finishBackground = resolve;
    });
    const firstPage = Array.from({ length: 10 }, (_, index) => ({
      id: `item-${index}`,
      start_time: 1_000 - index,
    }));
    const callWS = vi
      .fn()
      .mockResolvedValueOnce({ items: firstPage })
      .mockReturnValueOnce(background);
    const firstPaint = vi.fn();
    const api = { callWS } as unknown as HomeAssistantApi;

    const complete = listActivityWindow(
      api,
      "camera.front",
      "watchzone/reviews/list",
      { historyDays: 1, onProgress: firstPaint },
    );

    await vi.waitFor(() => expect(firstPaint).toHaveBeenCalledOnce());
    expect(firstPaint).toHaveBeenCalledWith(firstPage);
    expect(callWS.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ limit: 10, summary_only: true }),
    );
    await vi.waitFor(() => expect(callWS).toHaveBeenCalledTimes(2));
    expect(callWS.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ limit: 500, summary_only: false }),
    );
    finishBackground?.({ items: [] });
    await expect(complete).resolves.toHaveLength(10);
  });
});
