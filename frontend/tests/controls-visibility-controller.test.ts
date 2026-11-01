import type { ReactiveController, ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CAMERA_CONTROLS_HIDE_DELAY_MS } from "../src/core/constants";
import { CameraControlsVisibilityController } from "../src/modules/camera/controls-visibility.controller";

class TestHost implements ReactiveControllerHost {
  public readonly controllers: ReactiveController[] = [];
  public readonly updateComplete = Promise.resolve(true);
  public readonly requestUpdate = vi.fn();

  public addController(controller: ReactiveController): void {
    this.controllers.push(controller);
  }

  public removeController(controller: ReactiveController): void {
    const index = this.controllers.indexOf(controller);
    if (index >= 0) this.controllers.splice(index, 1);
  }
}

function pointerEvent(pointerType: string): PointerEvent {
  return { pointerType } as PointerEvent;
}

describe("camera control visibility controller", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays visible while hovered and hides after the named delay", () => {
    vi.useFakeTimers();
    const host = new TestHost();
    const controller = new CameraControlsVisibilityController(host);

    controller.handlePointerEnter(pointerEvent("mouse"));
    expect(controller.visible).toBe(true);
    vi.advanceTimersByTime(CAMERA_CONTROLS_HIDE_DELAY_MS * 2);
    expect(controller.visible).toBe(true);

    controller.handlePointerLeave(pointerEvent("mouse"));
    vi.advanceTimersByTime(CAMERA_CONTROLS_HIDE_DELAY_MS - 1);
    expect(controller.visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(controller.visible).toBe(false);
    expect(host.requestUpdate).toHaveBeenCalledTimes(2);
  });

  it("reveals on touch, resets on another touch, and cleans up its timer", () => {
    vi.useFakeTimers();
    const host = new TestHost();
    const controller = new CameraControlsVisibilityController(host);

    controller.handlePointerDown(pointerEvent("touch"));
    vi.advanceTimersByTime(CAMERA_CONTROLS_HIDE_DELAY_MS - 1);
    controller.handlePointerDown(pointerEvent("touch"));
    vi.advanceTimersByTime(CAMERA_CONTROLS_HIDE_DELAY_MS - 1);
    expect(controller.visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(controller.visible).toBe(false);

    controller.handlePointerDown(pointerEvent("touch"));
    controller.hostDisconnected();
    vi.advanceTimersByTime(CAMERA_CONTROLS_HIDE_DELAY_MS);
    expect(controller.visible).toBe(false);
  });
});
