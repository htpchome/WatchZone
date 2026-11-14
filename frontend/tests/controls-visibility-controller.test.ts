import type { ReactiveController, ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MEDIA_OVERLAY_HIDE_DELAY_MS,
  MediaOverlayVisibilityController,
} from "../src/ui/media-overlay-visibility.controller";

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

function pointerEvent(
  pointerType: string,
  currentTarget?: HTMLElement,
): PointerEvent {
  return { currentTarget, pointerType } as unknown as PointerEvent;
}

describe("media overlay visibility controller", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays visible while hovered and hides after the named delay", () => {
    vi.useFakeTimers();
    const host = new TestHost();
    const visibility: boolean[] = [];
    const controller = new MediaOverlayVisibilityController(host, {
      onVisibilityChange: (visible) => visibility.push(visible),
    });

    controller.handlePointerEnter(pointerEvent("mouse"));
    expect(controller.visible).toBe(true);
    expect(controller.sourceVisible).toBe(true);
    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS * 2);
    expect(controller.visible).toBe(true);

    controller.handlePointerLeave(pointerEvent("mouse"));
    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS - 1);
    expect(controller.visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(controller.visible).toBe(false);
    expect(controller.sourceVisible).toBe(false);
    expect(host.requestUpdate).toHaveBeenCalledTimes(2);
    expect(visibility).toEqual([true, false]);
  });

  it("hides a revealed overlay from the timer without an outside action", () => {
    vi.useFakeTimers();
    const host = new TestHost();
    const controller = new MediaOverlayVisibilityController(host);

    controller.reveal();
    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS - 1);
    expect(controller.visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(controller.visible).toBe(false);
    expect(controller.sourceVisible).toBe(false);
  });

  it("lets touch replace stale hover with the normal hide timer", () => {
    vi.useFakeTimers();
    const controller = new MediaOverlayVisibilityController(new TestHost());

    controller.handlePointerEnter(pointerEvent("mouse"));
    controller.revealFromTouch();
    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS);

    expect(controller.visible).toBe(false);
    expect(controller.sourceVisible).toBe(false);
  });

  it("restarts the timer when revealed again while visible", () => {
    vi.useFakeTimers();
    const controller = new MediaOverlayVisibilityController(new TestHost());

    controller.reveal();
    expect(controller.visible).toBe(true);
    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS - 1);
    controller.reveal();
    expect(controller.visible).toBe(true);

    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS - 1);
    expect(controller.visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(controller.visible).toBe(false);
  });

  it("does not let pointer-origin focus pin the overlay", () => {
    vi.useFakeTimers();
    const root = {
      blur: vi.fn(),
      matches: vi.fn(() => true),
    } as unknown as HTMLElement;
    const controller = new MediaOverlayVisibilityController(new TestHost());

    controller.handlePointerDown(pointerEvent("mouse", root));
    controller.handleFocusIn({ target: root } as unknown as FocusEvent);
    controller.handlePointerLeave(pointerEvent("mouse", root));
    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS);

    expect(controller.visible).toBe(false);
  });

  it("cleans up a pending timer on disconnect", () => {
    vi.useFakeTimers();
    const controller = new MediaOverlayVisibilityController(new TestHost());

    controller.reveal();
    controller.hostDisconnected();
    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS);
    expect(controller.visible).toBe(false);
  });

  it("invalidates stale holds when presentation ownership changes", () => {
    vi.useFakeTimers();
    const controller = new MediaOverlayVisibilityController(new TestHost());
    const staleRelease = controller.hold();

    controller.setActive(false);
    expect(controller.visible).toBe(false);
    controller.setActive(true);
    const currentRelease = controller.hold();
    staleRelease();
    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS);
    expect(controller.visible).toBe(true);

    currentRelease();
    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS);
    expect(controller.visible).toBe(false);
  });

  it("introduces the source independently, then shares the hide deadline", () => {
    vi.useFakeTimers();
    const controller = new MediaOverlayVisibilityController(new TestHost());

    controller.revealSource();
    expect(controller.sourceVisible).toBe(true);
    expect(controller.visible).toBe(false);

    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS - 1);
    expect(controller.sourceVisible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(controller.sourceVisible).toBe(false);
    expect(controller.visible).toBe(false);
  });
});
