import type { ReactiveControllerHost } from "lit";
import { describe, expect, it, vi } from "vitest";

import { CameraConnectionQueueController } from "../src/modules/camera/connection-queue.controller";

class TestHost implements ReactiveControllerHost {
  public addController(): void {}
  public removeController(): void {}
  public requestUpdate = vi.fn();
  public readonly updateComplete = Promise.resolve(true);
}

describe("CameraConnectionQueueController", () => {
  it("enables cameras sequentially in configured order", () => {
    const host = new TestHost();
    const queue = new CameraConnectionQueueController(host);
    queue.configure([
      { available: true, key: "camera.zero" },
      { available: true, key: "camera.one" },
      { available: true, key: "camera.two" },
    ]);

    expect(queue.isEnabled("camera.zero")).toBe(true);
    expect(queue.isEnabled("camera.one")).toBe(false);

    queue.settle("camera.zero");
    expect(queue.isEnabled("camera.one")).toBe(true);
    expect(queue.isEnabled("camera.two")).toBe(false);

    queue.settle("camera.one");
    expect(queue.isEnabled("camera.two")).toBe(true);
  });

  it("resets the ordered gate only for a real HA transport interruption", () => {
    const queue = new CameraConnectionQueueController(new TestHost());
    const cameras = [
      { available: true, key: "camera.zero" },
      { available: true, key: "camera.one" },
    ];
    queue.configure(cameras);
    queue.settle("camera.zero");
    queue.settle("camera.one");

    queue.configure(cameras, true);
    expect(queue.isEnabled("camera.one")).toBe(true);

    queue.configure(cameras, false);
    expect(queue.isEnabled("camera.zero")).toBe(false);
    expect(queue.isEnabled("camera.one")).toBe(false);

    queue.configure(cameras, true);
    expect(queue.isEnabled("camera.zero")).toBe(true);
    expect(queue.isEnabled("camera.one")).toBe(false);
  });
});
