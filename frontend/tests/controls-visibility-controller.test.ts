import type { ReactiveController, ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraControlsVisibilityController } from "../src/modules/camera/controls-visibility.controller";
import { CAMERA_OVERLAY_HIDE_DELAY_MS } from "../src/modules/camera/constants";

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
    const visibility: boolean[] = [];
    const controller = new CameraControlsVisibilityController(host, (visible) =>
      visibility.push(visible),
    );

    controller.handlePointerEnter(pointerEvent("mouse"));
    expect(controller.visible).toBe(true);
    expect(controller.sourceVisible).toBe(true);
    vi.advanceTimersByTime(CAMERA_OVERLAY_HIDE_DELAY_MS * 2);
    expect(controller.visible).toBe(true);

    controller.handlePointerLeave(pointerEvent("mouse"));
    vi.advanceTimersByTime(CAMERA_OVERLAY_HIDE_DELAY_MS - 1);
    expect(controller.visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(controller.visible).toBe(false);
    expect(controller.sourceVisible).toBe(false);
    expect(host.requestUpdate).toHaveBeenCalledTimes(2);
    expect(visibility).toEqual([true, false]);
  });

  it("reveals on touch, resets on another touch, and cleans up its timer", () => {
    vi.useFakeTimers();
    const host = new TestHost();
    const controller = new CameraControlsVisibilityController(host);

    controller.handlePointerDown(pointerEvent("touch"));
    vi.advanceTimersByTime(CAMERA_OVERLAY_HIDE_DELAY_MS - 1);
    controller.handlePointerDown(pointerEvent("touch"));
    vi.advanceTimersByTime(CAMERA_OVERLAY_HIDE_DELAY_MS - 1);
    expect(controller.visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(controller.visible).toBe(false);
    expect(controller.sourceVisible).toBe(false);

    controller.handlePointerDown(pointerEvent("touch"));
    controller.hostDisconnected();
    vi.advanceTimersByTime(CAMERA_OVERLAY_HIDE_DELAY_MS);
    expect(controller.visible).toBe(false);
  });

  it("introduces the source independently, then shares the hide deadline", () => {
    vi.useFakeTimers();
    const controller = new CameraControlsVisibilityController(new TestHost());

    controller.revealSource();
    expect(controller.sourceVisible).toBe(true);
    expect(controller.visible).toBe(false);

    vi.advanceTimersByTime(CAMERA_OVERLAY_HIDE_DELAY_MS - 1);
    expect(controller.sourceVisible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(controller.sourceVisible).toBe(false);
    expect(controller.visible).toBe(false);
  });
});
