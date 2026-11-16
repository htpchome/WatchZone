import { afterEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import {
  findEvent,
  findReview,
} from "../src/features/deep-links/activity-lookup";

describe("deep-link activity lookup", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses direct review lookup without requesting activity history", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const target = { id: "frigate:target", start_time: 900 };
    const callWS = vi.fn().mockResolvedValue({ item: target });
    const api = { callWS } as unknown as HomeAssistantApi;

    await expect(findReview(api, "camera.front", "target", 1)).resolves.toEqual(
      target,
    );
    expect(callWS).toHaveBeenCalledWith({
      type: "watchzone/reviews/get",
      entity_id: "camera.front",
      review_id: "target",
    });
    expect(callWS).toHaveBeenCalledOnce();
  });

  it("falls back to bounded paging when direct review lookup is unavailable", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const firstPage = Array.from({ length: 10 }, (_, index) => ({
      id: `item-${index}`,
      start_time: 1_000 - index,
    }));
    const target = { id: "frigate:target", start_time: 900 };
    const callWS = vi
      .fn()
      .mockRejectedValueOnce(new Error("direct lookup unavailable"))
      .mockResolvedValueOnce({ items: firstPage })
      .mockResolvedValueOnce({ items: [target] });
    const api = { callWS } as unknown as HomeAssistantApi;

    await expect(findReview(api, "camera.front", "target", 1)).resolves.toEqual(
      target,
    );
    expect(callWS).toHaveBeenCalledTimes(3);
    expect(callWS.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ limit: 10, summary_only: false }),
    );
    expect(callWS.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({ limit: 500, summary_only: false }),
    );
  });

  it("falls back to one event page when direct lookup returns no item", async () => {
    const target = { id: "frigate:target", start_time: 900 };
    const callWS = vi
      .fn()
      .mockResolvedValueOnce({ item: null })
      .mockResolvedValueOnce({ items: [target] });
    const api = { callWS } as unknown as HomeAssistantApi;

    await expect(findEvent(api, "camera.front", "target", 1)).resolves.toEqual(
      target,
    );
    expect(callWS).toHaveBeenCalledTimes(2);
    expect(callWS.mock.calls[0]?.[0]).toEqual({
      type: "watchzone/events/get",
      entity_id: "camera.front",
      event_id: "target",
    });
  });
});
