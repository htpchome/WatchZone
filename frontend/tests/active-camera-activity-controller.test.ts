import type { ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import { ActiveCameraActivityController } from "../src/stage/activity/active-camera-activity.controller";
import { CameraSelectionContext } from "../src/stage/camera-selection-context";

vi.mock("../src/providers/activity-update-resolver", () => ({
  subscribeActivityUpdates: vi.fn().mockResolvedValue(() => undefined),
}));

class TestHost implements ReactiveControllerHost {
  public readonly updateComplete = Promise.resolve(true);
  public readonly requestUpdate = vi.fn();

  public addController(): void {}

  public removeController(): void {}
}

describe("active camera activity controller", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reconciles within five seconds when the push transport is silent", async () => {
    vi.useFakeTimers();
    const item = {
      id: "frigate-main:review-1",
      revision: "draft",
      start_time: Date.now() / 1000,
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([item]);
    const selection = new CameraSelectionContext();
    const host = new TestHost();
    const api = {} as HomeAssistantApi;
    const controller = new ActiveCameraActivityController(
      host,
      () => ({
        api,
        cameraSelection: selection,
        historyDays: 5,
        targetModuleId: "camera-module",
      }),
      fetch,
      vi.fn(),
      "reviews",
    );
    controller.hostConnected();
    selection.publish(
      "camera-module",
      {},
      {
        activeEntityId: "camera.front",
        items: [{ entityId: "camera.front", label: "Front" }],
      },
      vi.fn(),
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    expect(controller.items).toEqual([item]);
    expect(fetch).toHaveBeenLastCalledWith(
      api,
      "camera.front",
      expect.objectContaining({ bypassCache: true, loadFullHistory: false }),
    );
    controller.hostDisconnected();
  });
});
