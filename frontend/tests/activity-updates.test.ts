import { describe, expect, it, vi } from "vitest";

import {
  subscribeActivityUpdates,
  type ActivityUpdateNotification,
} from "../src/api/activity-updates";
import type { HomeAssistantApi } from "../src/core/home-assistant";

describe("activity updates", () => {
  it("subscribes only through CameraOptics's normalized backend boundary", async () => {
    const unsubscribe = vi.fn();
    const subscribeMessage = vi.fn().mockResolvedValue(unsubscribe);
    const api = { subscribeMessage } as unknown as HomeAssistantApi;
    const callback = vi.fn<(update: ActivityUpdateNotification) => void>();

    const release = await subscribeActivityUpdates(
      api,
      "camera.driveway",
      "reviews",
      callback,
    );

    expect(subscribeMessage).toHaveBeenCalledWith(
      callback,
      {
        type: "camera_optics/activity/subscribe",
        entity_id: "camera.driveway",
        kind: "reviews",
      },
      { resubscribe: true },
    );
    release();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
