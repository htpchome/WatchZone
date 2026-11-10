import { describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import { subscribeFrigateActivityUpdates } from "../src/providers/frigate/activity-updates";

describe("Frigate activity updates", () => {
  it("uses official per-instance proxies and filters review activity by camera", async () => {
    const callbacks: Array<(payload: unknown) => void> = [];
    const unsubscribers = [vi.fn()];
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
          data: {
            detections: ["event-1"],
            objects: ["person"],
            sub_labels: ["Resident"],
            zones: ["driveway"],
          },
          id: "review-1",
          severity: "detection",
          start_time: 100,
        },
      }),
    );
    callbacks[0]?.(
      JSON.stringify({
        type: "update",
        after: {
          camera: "driveway",
          data: {
            detections: ["event-1"],
            metadata: {
              scene: "A resident walks toward the car.",
              title: "Resident approaching car",
            },
            objects: ["person"],
          },
          id: "review-1",
          severity: "alert",
          start_time: 100,
        },
      }),
    );
    callbacks[0]?.(
      JSON.stringify({
        type: "end",
        before: {
          camera: "driveway",
          data: { detections: ["event-1"], objects: ["person"] },
          end_time: 112,
          id: "review-1",
          severity: "alert",
          start_time: 100,
        },
      }),
    );
    expect(update).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        cameraName: "driveway",
        classification: "detection",
        id: "review-1",
        phase: "new",
        review: expect.objectContaining({
          classification: "detection",
          id: "frigate-west:review-1",
          labels: ["person"],
          related_event_ids: ["frigate-west:event-1"],
          reviewed: false,
          start_time: 100,
          sub_labels: ["Resident"],
          zones: ["driveway"],
        }),
        topic: "reviews",
      }),
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cameraName: "driveway",
        classification: "alert",
        id: "review-1",
        phase: "update",
        review: expect.objectContaining({
          analysis_description: "A resident walks toward the car.",
          analysis_title: "Resident approaching car",
        }),
        topic: "reviews",
      }),
    );
    expect(update).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        cameraName: "driveway",
        classification: "alert",
        id: "review-1",
        phase: "end",
        review: expect.objectContaining({ end_time: 112, media_end_time: 112 }),
        topic: "reviews",
      }),
    );

    unsubscribe();
    expect(unsubscribers[0]).toHaveBeenCalledOnce();
  });

  it("releases its review subscription", async () => {
    const unsubscribe = vi.fn();
    const subscribeMessage = vi.fn().mockResolvedValueOnce(unsubscribe);
    const api = { subscribeMessage } as unknown as HomeAssistantApi;

    const release = await subscribeFrigateActivityUpdates(
      api,
      {
        type: "frigate",
        instance_id: "frigate-main",
        camera_name: "front",
      },
      "reviews",
      vi.fn(),
    );
    release();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
