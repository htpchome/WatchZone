import type { ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActivityUpdateNotification } from "../src/api/activity-updates";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import { CameraActivityHighlightController } from "../src/stage/camera-presentation/activity-highlight.controller";

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
}));

vi.mock("../src/api/activity-updates", () => ({
  subscribeActivityUpdates: mocks.subscribe,
}));

class TestHost implements ReactiveControllerHost {
  public readonly requestUpdate = vi.fn();
  public readonly updateComplete = Promise.resolve(true);

  public addController(): void {}

  public removeController(): void {}
}

describe("camera activity highlight controller", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("retains an active highlight across an inner-dashboard reconnect", async () => {
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
    const controller = new CameraActivityHighlightController(new TestHost());
    controller.configure({ identity: {} } as HomeAssistantApi, "camera.front");
    controller.hostConnected();
    await vi.waitFor(() => expect(notify).toBeTypeOf("function"));
    notify?.({
      cameraName: "front",
      classification: "alert",
      id: "review-1",
      phase: "new",
      topic: "reviews",
    });
    expect(controller.classification).toBe("alert");

    controller.hostDisconnected();
    expect(controller.classification).toBe("alert");
    controller.hostConnected();
    expect(controller.classification).toBe("alert");
    controller.hostDisconnected();
  });

  it("accepts backend replay in a replacement minimal camera", async () => {
    mocks.subscribe.mockImplementation(
      async (
        _api: HomeAssistantApi,
        _entityId: string,
        _kind: string,
        callback: (notification: ActivityUpdateNotification) => void,
      ) => {
        callback({
          cameraName: "front",
          classification: "detection",
          id: "review-1",
          phase: "update",
          topic: "reviews",
        });
        return vi.fn();
      },
    );
    const controller = new CameraActivityHighlightController(new TestHost());
    controller.configure({ identity: {} } as HomeAssistantApi, "camera.front");

    controller.hostConnected();

    await vi.waitFor(() => expect(controller.classification).toBe("detection"));
    controller.hostDisconnected();
  });
});
