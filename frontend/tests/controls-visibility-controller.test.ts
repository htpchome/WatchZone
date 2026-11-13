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

  it("reveals on one touch and hides from the timer without an outside touch", () => {
    vi.useFakeTimers();
    const host = new TestHost();
    const controller = new MediaOverlayVisibilityController(host);

    controller.handlePointerDown(pointerEvent("touch"));
    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS - 1);
    expect(controller.visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(controller.visible).toBe(false);
    expect(controller.sourceVisible).toBe(false);
  });

  it("restarts the timer when touched again while visible", () => {
    vi.useFakeTimers();
    const controller = new MediaOverlayVisibilityController(new TestHost());

    controller.handlePointerDown(pointerEvent("touch"));
    expect(controller.visible).toBe(true);
    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS - 1);
    controller.handlePointerDown(pointerEvent("touch"));
    expect(controller.visible).toBe(true);

    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS - 1);
    expect(controller.visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(controller.visible).toBe(false);
  });

  it("does not let touch-origin focus or sticky hover pin the overlay", () => {
    vi.useFakeTimers();
    const root = {
      blur: vi.fn(),
      matches: vi.fn(() => true),
    } as unknown as HTMLElement;
    const controller = new MediaOverlayVisibilityController(new TestHost());

    controller.handlePointerDown(pointerEvent("touch", root));
    controller.handleFocusIn({ target: root } as unknown as FocusEvent);
    controller.handlePointerEnd(pointerEvent("touch", root));
    vi.runOnlyPendingTimers();

    expect(root.blur).toHaveBeenCalledOnce();
    expect(controller.visible).toBe(false);
  });

  it("suppresses reveals while media is zoomed and restores touch toggling after reset", () => {
    const controller = new MediaOverlayVisibilityController(new TestHost());

    controller.setSuppressed(true);
    controller.handlePointerDown(pointerEvent("touch"));
    expect(controller.visible).toBe(false);
    controller.setSuppressed(false);
    controller.handlePointerDown(pointerEvent("touch"));
    expect(controller.visible).toBe(true);
  });

  it("cleans up a pending timer on disconnect", () => {
    vi.useFakeTimers();
    const controller = new MediaOverlayVisibilityController(new TestHost());

    controller.handlePointerDown(pointerEvent("touch"));
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
