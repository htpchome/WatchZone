import { afterEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import {
  findEvent,
  findReview,
} from "../src/features/deep-links/activity-lookup";

describe("deep-link activity lookup", () => {
  afterEach(() => vi.restoreAllMocks());

  it("stops paging as soon as the requested normalized review is found", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const firstPage = Array.from({ length: 10 }, (_, index) => ({
      id: `item-${index}`,
      start_time: 1_000 - index,
    }));
    const target = { id: "frigate:target", start_time: 900 };
    const callWS = vi
      .fn()
      .mockResolvedValueOnce({ items: firstPage })
      .mockResolvedValueOnce({ items: [target] });
    const api = { callWS } as unknown as HomeAssistantApi;

    await expect(findReview(api, "camera.front", "target", 1)).resolves.toEqual(
      target,
    );
    expect(callWS).toHaveBeenCalledTimes(2);
    expect(callWS.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ limit: 10, summary_only: false }),
    );
    expect(callWS.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ limit: 500, summary_only: false }),
    );
  });

  it("does not request background history when the first event page matches", async () => {
    const target = { id: "frigate:target", start_time: 900 };
    const callWS = vi.fn().mockResolvedValue({ items: [target] });
    const api = { callWS } as unknown as HomeAssistantApi;

    await expect(findEvent(api, "camera.front", "target", 1)).resolves.toEqual(
      target,
    );
    expect(callWS).toHaveBeenCalledOnce();
  });
});
