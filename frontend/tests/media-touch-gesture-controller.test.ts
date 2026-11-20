import { describe, expect, it, vi } from "vitest";

import { ZoomTouchGestureInterpreter } from "../src/ui/zoom/touch-gesture";
import type { ZoomTransformController } from "../src/ui/zoom/transform.controller";

function zoomController(): ZoomTransformController {
  return {
    handlePointerDown: vi.fn(),
    handlePointerUp: vi.fn(),
  } as unknown as ZoomTransformController;
}

function touchEvent(path: EventTarget[], type = "pointerdown"): PointerEvent {
  return {
    clientX: 40,
    clientY: 60,
    composedPath: () => path,
    pointerId: 1,
    pointerType: "touch",
    preventDefault: vi.fn(),
    type,
  } as unknown as PointerEvent;
}

describe("media touch gesture controller", () => {
  it("classifies a completed surface tap without revealing during pointerdown", () => {
    const zoom = zoomController();
    const controller = new ZoomTouchGestureInterpreter(zoom);
    const surface = document.createElement("div");
    const down = touchEvent([surface]);
    const up = {
      ...touchEvent([surface], "pointerup"),
      timeStamp: down.timeStamp + 10,
    } as unknown as PointerEvent;

    expect(controller.handlePointerDown(down)).toBe(true);
    expect(down.preventDefault).not.toHaveBeenCalled();
    expect(controller.consumeSurfaceActivation()).toBe(false);
    expect(zoom.handlePointerDown).toHaveBeenCalledWith(down);
    controller.handlePointerUp(up);
    expect(controller.consumeSurfaceActivation()).toBe(true);
    controller.reset();
  });

  it("does not consume a deliberate touch that starts on a control", () => {
    const zoom = zoomController();
    const controller = new ZoomTouchGestureInterpreter(zoom);
    const button = document.createElement("button");
    const event = touchEvent([button]);

    expect(controller.handlePointerDown(event)).toBe(true);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(zoom.handlePointerDown).not.toHaveBeenCalled();
  });
});
