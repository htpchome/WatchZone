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

  it("defers camera-specific loading until carousel selection settles", async () => {
    const fetch = vi.fn(async (_api: HomeAssistantApi, entityId: string) => [
      {
        id: `${entityId}:review`,
        revision: "loaded",
        start_time: Date.now() / 1000,
      },
    ]);
    const selection = new CameraSelectionContext();
    const controller = new ActiveCameraActivityController(
      new TestHost(),
      () => ({
        api: {} as HomeAssistantApi,
        cameraSelection: selection,
        historyDays: 5,
        targetModuleId: "camera-module",
      }),
      fetch,
      vi.fn(),
      "reviews",
    );
    controller.hostConnected();
    const owner = {};
    const items = [
      { entityId: "camera.front", label: "Front" },
      { entityId: "camera.driveway", label: "Driveway" },
    ];
    const publish = (activeEntityId: string, settled: boolean) =>
      selection.publish(
        "camera-module",
        owner,
        { activeEntityId, items, settled },
        vi.fn(),
      );

    publish("camera.front", true);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(controller.items[0]?.id).toBe("camera.front:review"),
    );

    publish("camera.driveway", false);
    expect(fetch).toHaveBeenCalledOnce();
    expect(controller.items[0]?.id).toBe("camera.front:review");

    publish("camera.driveway", true);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(controller.items[0]?.id).toBe("camera.driveway:review"),
    );
    controller.hostDisconnected();
  });

  it("retains only the newest first-paint rows for inactive cameras", async () => {
    const now = Date.now() / 1000;
    const loaded = Array.from({ length: 25 }, (_, index) => ({
      id: `front:${index}`,
      revision: "loaded",
      start_time: now - index,
    }));
    const fetch = vi.fn(async (_api: HomeAssistantApi, entityId: string) =>
      entityId === "camera.front" ? loaded : [],
    );
    const selection = new CameraSelectionContext();
    const controller = new ActiveCameraActivityController(
      new TestHost(),
      () => ({
        api: {} as HomeAssistantApi,
        cameraSelection: selection,
        historyDays: 10,
        targetModuleId: "camera-module",
      }),
      fetch,
      vi.fn(),
      "reviews",
    );
    controller.hostConnected();
    const owner = {};
    const publish = (activeEntityId: string) =>
      selection.publish(
        "camera-module",
        owner,
        {
          activeEntityId,
          items: [
            { entityId: "camera.front", label: "Front" },
            { entityId: "camera.back", label: "Back" },
          ],
        },
        vi.fn(),
      );

    publish("camera.front");
    await vi.waitFor(() => expect(controller.items).toHaveLength(25));
    publish("camera.back");
    publish("camera.front");
    expect(controller.items).toHaveLength(10);
    expect(controller.items.map(({ id }) => id)).toEqual(
      loaded.slice(0, 10).map(({ id }) => id),
    );
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

  it("exposes an immediate authoritative refresh for draft media", async () => {
    const now = Date.now() / 1000;
    let mediaReady = false;
    const fetch = vi.fn(async () => [
      {
        id: "front:draft",
        revision: mediaReady ? "ready" : "draft",
        start_time: now,
      },
    ]);
    const selection = new CameraSelectionContext();
    const controller = new ActiveCameraActivityController(
      new TestHost(),
      () => ({
        api: {} as HomeAssistantApi,
        cameraSelection: selection,
        historyDays: 3,
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
    await vi.waitFor(() => expect(controller.items[0]?.revision).toBe("draft"));

    mediaReady = true;
    await controller.refresh();

    expect(controller.items[0]?.revision).toBe("ready");
    expect(fetch).toHaveBeenCalledTimes(2);
    controller.hostDisconnected();
  });
});
