import type { ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { THUMBNAIL_PREVIEW_LONG_PRESS_MS } from "../src/core/constants";
import { ThumbnailPreviewPressController } from "../src/ui/activity-list/thumbnail-preview-press.controller";

describe("thumbnail preview press controller", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("activates after a stationary touch hold and consumes its click", async () => {
    vi.useFakeTimers();
    const activate = vi.fn();
    const deactivate = vi.fn();
    const controller = new ThumbnailPreviewPressController(host(), {
      activate,
      deactivate,
    });

    controller.start(pointerEvent("pointerdown", 1, 12, 18), "review-1");
    await vi.advanceTimersByTimeAsync(THUMBNAIL_PREVIEW_LONG_PRESS_MS);

    expect(activate).toHaveBeenCalledWith("review-1");
    controller.end(pointerEvent("pointerup", 1, 12, 18));
    expect(deactivate).toHaveBeenCalledWith("review-1");
    expect(controller.consumeClick("review-1")).toBe(true);
    expect(controller.consumeClick("review-1")).toBe(false);
  });

  it("leaves a short tap available to the tile", async () => {
    vi.useFakeTimers();
    const activate = vi.fn();
    const controller = new ThumbnailPreviewPressController(host(), {
      activate,
      deactivate: vi.fn(),
    });

    controller.start(pointerEvent("pointerdown", 1, 12, 18), "review-1");
    controller.end(pointerEvent("pointerup", 1, 12, 18));
    await vi.runAllTimersAsync();

    expect(activate).not.toHaveBeenCalled();
    expect(controller.consumeClick("review-1")).toBe(false);
  });

  it("cancels before activation when touch movement exceeds tolerance", async () => {
    vi.useFakeTimers();
    const activate = vi.fn();
    const controller = new ThumbnailPreviewPressController(host(), {
      activate,
      deactivate: vi.fn(),
    });

    controller.start(pointerEvent("pointerdown", 1, 12, 18), "review-1");
    controller.move(pointerEvent("pointermove", 1, 30, 18));
    await vi.runAllTimersAsync();

    expect(activate).not.toHaveBeenCalled();
  });

  it("ignores mouse presses", async () => {
    vi.useFakeTimers();
    const activate = vi.fn();
    const controller = new ThumbnailPreviewPressController(host(), {
      activate,
      deactivate: vi.fn(),
    });

    controller.start(
      pointerEvent("pointerdown", 1, 12, 18, "mouse"),
      "review-1",
    );
    await vi.runAllTimersAsync();

    expect(activate).not.toHaveBeenCalled();
  });
});

function host(): ReactiveControllerHost {
  return {
    addController: vi.fn(),
    removeController: vi.fn(),
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  };
}

function pointerEvent(
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
  pointerType = "touch",
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: clientX },
    clientY: { value: clientY },
    isPrimary: { value: true },
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
  });
  return event as PointerEvent;
}
