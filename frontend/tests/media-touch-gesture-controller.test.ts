import { describe, expect, it, vi } from "vitest";

import { MediaTouchGestureController } from "../src/ui/media-touch-gesture.controller";
import type { MediaZoomController } from "../src/ui/media-zoom.controller";

function zoomController(): MediaZoomController {
  return {
    handlePointerDown: vi.fn(),
  } as unknown as MediaZoomController;
}

function touchEvent(path: EventTarget[]): PointerEvent {
  return {
    clientX: 40,
    clientY: 60,
    composedPath: () => path,
    pointerId: 1,
    pointerType: "touch",
    preventDefault: vi.fn(),
  } as unknown as PointerEvent;
}

describe("media touch gesture controller", () => {
  it("consumes the surface touch that reveals controls", () => {
    const revealOverlay = vi.fn();
    const zoom = zoomController();
    const controller = new MediaTouchGestureController(zoom, {
      revealOverlay,
      touchOverlayEnabled: () => true,
    });
    const event = touchEvent([document.createElement("div")]);

    expect(controller.handlePointerDown(event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(revealOverlay).toHaveBeenCalledOnce();
    expect(zoom.handlePointerDown).toHaveBeenCalledWith(event);
    controller.reset();
  });

  it("does not consume a deliberate touch that starts on a control", () => {
    const revealOverlay = vi.fn();
    const zoom = zoomController();
    const controller = new MediaTouchGestureController(zoom, {
      revealOverlay,
      touchOverlayEnabled: () => true,
    });
    const button = document.createElement("button");
    const event = touchEvent([button]);

    expect(controller.handlePointerDown(event)).toBe(true);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(revealOverlay).not.toHaveBeenCalled();
    expect(zoom.handlePointerDown).not.toHaveBeenCalled();
  });
});
