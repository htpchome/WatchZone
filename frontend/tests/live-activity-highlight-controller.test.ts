import type { ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { ActivityUpdateNotification } from "../src/providers/activity-update-resolver";
import { LiveActivityHighlightController } from "../src/stage/modules/camera/activity-highlight.controller";

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
}));

vi.mock("../src/providers/activity-update-resolver", () => ({
  subscribeActivityUpdates: mocks.subscribe,
}));

class TestHost implements ReactiveControllerHost {
  public readonly updateComplete = Promise.resolve(true);
  public readonly requestUpdate = vi.fn();

  public addController(): void {}

  public removeController(): void {}
}

describe("live activity highlight controller", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("shows draft activity immediately, promotes it, and clears it on end", async () => {
    let notify:
      ((notification: ActivityUpdateNotification) => void) | undefined;
    const unsubscribe = vi.fn();
    mocks.subscribe.mockImplementation(
      async (
        _api: HomeAssistantApi,
        _entityId: string,
        _kind: string,
        callback: (notification: ActivityUpdateNotification) => void,
      ) => {
        notify = callback;
        return unsubscribe;
      },
    );
    const host = new TestHost();
    const api = { identity: {} } as HomeAssistantApi;
    const context = {
      activeEntityId: "camera.front",
      api,
      enabled: true,
      entityIds: ["camera.front"],
    };
    const controller = new LiveActivityHighlightController(host, () => context);

    controller.hostConnected();
    await vi.waitFor(() => expect(notify).toBeTypeOf("function"));
    expect(mocks.subscribe).toHaveBeenCalledWith(
      api,
      "camera.front",
      "reviews",
      expect.any(Function),
    );

    notify?.({
      cameraName: "front",
      classification: "detection",
      id: "review-1",
      phase: "new",
      topic: "reviews",
    });
    expect(controller.classification).toBe("detection");

    notify?.({
      cameraName: "front",
      classification: "alert",
      id: "review-1",
      phase: "update",
      topic: "reviews",
    });
    expect(controller.classification).toBe("alert");

    notify?.({
      cameraName: "front",
      classification: "alert",
      id: "review-1",
      phase: "end",
      topic: "reviews",
    });
    expect(controller.classification).toBeUndefined();

    notify?.({
      cameraName: "front",
      classification: "alert",
      id: "review-1",
      phase: "update",
      topic: "reviews",
    });
    expect(controller.classification).toBeUndefined();

    controller.hostDisconnected();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("keeps the strongest remaining review and ignores event notifications", async () => {
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
        return vi.fn();
      },
    );
    const controller = new LiveActivityHighlightController(
      new TestHost(),
      () => ({
        activeEntityId: "camera.front",
        api: { identity: {} } as HomeAssistantApi,
        enabled: true,
        entityIds: ["camera.front"],
      }),
    );
    controller.hostConnected();
    await vi.waitFor(() => expect(notify).toBeTypeOf("function"));

    notify?.({
      cameraName: "front",
      classification: "alert",
      id: "event-1",
      phase: "new",
      topic: "events",
    });
    expect(controller.classification).toBeUndefined();

    for (const [id, classification] of [
      ["review-1", "detection"],
      ["review-2", "alert"],
    ] as const) {
      notify?.({
        cameraName: "front",
        classification,
        id,
        phase: "new",
        topic: "reviews",
      });
    }
    expect(controller.classification).toBe("alert");
    notify?.({
      cameraName: "front",
      classification: "alert",
      id: "review-2",
      phase: "end",
      topic: "reviews",
    });
    expect(controller.classification).toBe("detection");
  });

  it("retains active review state while another camera is selected", async () => {
    const callbacks = new Map<
      string,
      (notification: ActivityUpdateNotification) => void
    >();
    mocks.subscribe.mockImplementation(
      async (
        _api: HomeAssistantApi,
        entityId: string,
        _kind: string,
        callback: (notification: ActivityUpdateNotification) => void,
      ) => {
        callbacks.set(entityId, callback);
        return vi.fn();
      },
    );
    const host = new TestHost();
    const context = {
      activeEntityId: "camera.front",
      api: { identity: {} } as HomeAssistantApi,
      enabled: true,
      entityIds: ["camera.front", "camera.driveway"],
    };
    const controller = new LiveActivityHighlightController(host, () => context);
    controller.hostConnected();
    await vi.waitFor(() => expect(callbacks.size).toBe(2));

    callbacks.get("camera.front")?.({
      cameraName: "front",
      classification: "alert",
      id: "review-1",
      phase: "new",
      topic: "reviews",
    });
    expect(controller.classification).toBe("alert");

    context.activeEntityId = "camera.driveway";
    controller.hostUpdate();
    expect(controller.classification).toBeUndefined();
    context.activeEntityId = "camera.front";
    controller.hostUpdate();
    expect(controller.classification).toBe("alert");

    context.activeEntityId = "camera.driveway";
    controller.hostUpdate();
    callbacks.get("camera.front")?.({
      cameraName: "front",
      classification: "alert",
      id: "review-1",
      phase: "end",
      topic: "reviews",
    });
    context.activeEntityId = "camera.front";
    controller.hostUpdate();
    expect(controller.classification).toBeUndefined();
  });
});
