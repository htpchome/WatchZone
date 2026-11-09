import { describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import { subscribeFrigateActivityUpdates } from "../src/providers/frigate/activity-updates";

describe("Frigate activity updates", () => {
  it("uses official per-instance proxies and filters review activity by camera", async () => {
    const callbacks: Array<(payload: unknown) => void> = [];
    const unsubscribers = [vi.fn(), vi.fn()];
    const subscribeMessage = vi.fn(async (callback) => {
      callbacks.push(callback as (payload: unknown) => void);
      return unsubscribers[callbacks.length - 1];
    });
    const api = { subscribeMessage } as unknown as HomeAssistantApi;
    const update = vi.fn();

    const unsubscribe = await subscribeFrigateActivityUpdates(
      api,
      {
        type: "frigate",
        instance_id: "frigate-west",
        camera_name: "driveway",
      },
      "reviews",
      update,
    );

    expect(subscribeMessage).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      { type: "frigate/reviews/subscribe", instance_id: "frigate-west" },
      { resubscribe: true },
    );
    expect(subscribeMessage).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      { type: "frigate/events/subscribe", instance_id: "frigate-west" },
      { resubscribe: true },
    );

    callbacks[0]?.(
      JSON.stringify({
        after: { camera: "front", severity: "detection" },
      }),
    );
    callbacks[0]?.(
      JSON.stringify({ after: { camera: "driveway", severity: "motion" } }),
    );
    expect(update).not.toHaveBeenCalled();

    callbacks[0]?.(
      JSON.stringify({
        type: "new",
        after: {
          camera: "driveway",
          id: "review-1",
          severity: "detection",
        },
      }),
    );
    callbacks[0]?.(
      JSON.stringify({
        type: "update",
        after: { camera: "driveway", id: "review-1", severity: "alert" },
      }),
    );
    callbacks[0]?.(
      JSON.stringify({
        type: "end",
        before: { camera: "driveway", id: "review-1", severity: "alert" },
      }),
    );
    callbacks[1]?.({ before: { camera: "driveway" } });
    expect(update).toHaveBeenCalledTimes(4);
    expect(update).toHaveBeenNthCalledWith(1, {
      cameraName: "driveway",
      classification: "detection",
      id: "review-1",
      phase: "new",
      topic: "reviews",
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      cameraName: "driveway",
      classification: "alert",
      id: "review-1",
      phase: "update",
      topic: "reviews",
    });
    expect(update).toHaveBeenNthCalledWith(3, {
      cameraName: "driveway",
      classification: "alert",
      id: "review-1",
      phase: "end",
      topic: "reviews",
    });

    unsubscribe();
    expect(unsubscribers[0]).toHaveBeenCalledOnce();
    expect(unsubscribers[1]).toHaveBeenCalledOnce();
  });

  it("releases an established subscription if a later subscription fails", async () => {
    const unsubscribe = vi.fn();
    const subscribeMessage = vi
      .fn()
      .mockResolvedValueOnce(unsubscribe)
      .mockRejectedValueOnce(new Error("unavailable"));
    const api = { subscribeMessage } as unknown as HomeAssistantApi;

    await expect(
      subscribeFrigateActivityUpdates(
        api,
        {
          type: "frigate",
          instance_id: "frigate-main",
          camera_name: "front",
        },
        "reviews",
        vi.fn(),
      ),
    ).rejects.toThrow("unavailable");
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
