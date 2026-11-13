import type { ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraSlideshowController } from "../src/stage/modules/camera/slideshow.controller";

class TestHost implements ReactiveControllerHost {
  public readonly updateComplete = Promise.resolve(true);
  public readonly requestUpdate = vi.fn();

  public addController(): void {}

  public removeController(): void {}
}

describe("camera slideshow controller", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("counts down, advances, and restarts from the configured interval", async () => {
    vi.useFakeTimers();
    const host = new TestHost();
    const advance = vi.fn();
    const controller = new CameraSlideshowController(host, () => ({
      advance,
      intervalSeconds: 5,
      itemCount: 3,
    }));
    controller.hostConnected();
    controller.toggle();

    expect(controller.enabled).toBe(true);
    expect(controller.remainingSeconds).toBe(5);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(controller.remainingSeconds).toBe(4);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(advance).toHaveBeenCalledOnce();
    expect(controller.remainingSeconds).toBe(5);
  });

  it("holds for takeover and advances immediately when resumed", async () => {
    vi.useFakeTimers();
    const host = new TestHost();
    const advance = vi.fn();
    const controller = new CameraSlideshowController(host, () => ({
      advance,
      intervalSeconds: 10,
      itemCount: 2,
    }));
    controller.hostConnected();
    controller.toggle();
    await vi.advanceTimersByTimeAsync(2_000);
    controller.hold();

    expect(controller.held).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(advance).not.toHaveBeenCalled();

    expect(controller.resumeAfterTakeover()).toBe(true);
    expect(controller.held).toBe(false);
    expect(controller.remainingSeconds).toBe(10);
    expect(advance).toHaveBeenCalledOnce();
  });

  it("restarts the full interval on a manual camera selection", async () => {
    vi.useFakeTimers();
    const controller = new CameraSlideshowController(new TestHost(), () => ({
      advance: vi.fn(),
      intervalSeconds: 10,
      itemCount: 2,
    }));
    controller.hostConnected();
    controller.toggle();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(controller.remainingSeconds).toBe(6);

    controller.manualSelection();
    expect(controller.remainingSeconds).toBe(10);
  });
});
