import type { ReactiveControllerHost } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { ActivityUpdateNotification } from "../src/providers/activity-update-resolver";
import { ActiveCameraActivityController } from "../src/stage/activity/active-camera-activity.controller";
import { CameraSelectionContext } from "../src/stage/camera-selection-context";

const mocks = vi.hoisted(() => ({ subscribe: vi.fn() }));

vi.mock("../src/providers/activity-update-resolver", () => ({
  subscribeActivityUpdates: mocks.subscribe,
}));

class TestHost implements ReactiveControllerHost {
  public readonly updateComplete = Promise.resolve(true);
  public readonly requestUpdate = vi.fn();

  public addController(): void {}

  public removeController(): void {}
}

describe("active camera activity controller", () => {
  beforeEach(() => {
    mocks.subscribe.mockResolvedValue(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("refreshes on the leading edge without notification timer starvation", async () => {
    vi.useFakeTimers();
    let notify: (() => void) | undefined;
    mocks.subscribe.mockImplementation(
      async (
        _api: HomeAssistantApi,
        _entityId: string,
        _kind: string,
        callback: () => void,
      ) => {
        notify = callback;
        return () => undefined;
      },
    );
    const fetch = vi.fn().mockResolvedValue([]);
    const selection = new CameraSelectionContext();
    const api = {} as HomeAssistantApi;
    const controller = new ActiveCameraActivityController(
      new TestHost(),
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
    await vi.waitFor(() => expect(notify).toBeTypeOf("function"));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(controller.loading).toBe(false));

    const baselineCalls = fetch.mock.calls.length;
    notify?.();
    expect(fetch).toHaveBeenCalledTimes(baselineCalls + 1);
    for (let index = 0; index < 10; index += 1) notify?.();
    expect(fetch).toHaveBeenCalledTimes(baselineCalls + 11);

    await vi.advanceTimersByTimeAsync(1_500);
    expect(fetch).toHaveBeenCalledTimes(baselineCalls + 12);

    controller.hostDisconnected();
  });

  it("renders pushed draft state immediately and retains it across camera navigation", async () => {
    let notify:
      ((notification: ActivityUpdateNotification) => void) | undefined;
    mocks.subscribe.mockImplementation(
      async (
        _api: HomeAssistantApi,
        _entityId: string,
        _kind: string,
        callback: (notification: ActivityUpdateNotification) => void,
      ) => {
        notify = callback;
        return () => undefined;
      },
    );
    const selection = new CameraSelectionContext();
    const draft = {
      id: "frigate-main:review-1",
      revision: "push:new",
      start_time: Date.now() / 1000,
    };
    const controller = new ActiveCameraActivityController(
      new TestHost(),
      () => ({
        api: {} as HomeAssistantApi,
        cameraSelection: selection,
        historyDays: 5,
        targetModuleId: "camera-module",
      }),
      vi.fn().mockResolvedValue([]),
      vi.fn(),
      "reviews",
      (notification) =>
        notification.review
          ? {
              id: notification.review.id,
              revision: notification.review.revision,
              start_time: notification.review.start_time,
            }
          : undefined,
    );
    controller.hostConnected();
    const selectionOwner = {};
    const publish = (activeEntityId: string) =>
      selection.publish(
        "camera-module",
        selectionOwner,
        {
          activeEntityId,
          items: [
            { entityId: "camera.front", label: "Front" },
            { entityId: "camera.driveway", label: "Driveway" },
          ],
        },
        vi.fn(),
      );
    publish("camera.front");
    await vi.waitFor(() => expect(notify).toBeTypeOf("function"));

    notify?.({
      cameraName: "front",
      id: "review-1",
      phase: "new",
      review: draft,
      topic: "reviews",
    } as ActivityUpdateNotification);
    expect(controller.items).toEqual([draft]);

    publish("camera.driveway");
    expect(controller.items).toEqual([]);
    await vi.waitFor(() => expect(notify).toBeTypeOf("function"));
    publish("camera.front");
    expect(controller.items).toEqual([draft]);
    controller.hostDisconnected();
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
