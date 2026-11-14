import type { ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PressInteractionController } from "../src/ui/press-interaction.controller";

describe("press interaction controller", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("finishes a press from a window pointer-up fallback", () => {
    const start = vi.fn();
    const end = vi.fn();
    const controller = new PressInteractionController<string>(host(), {
      actionFor: (target) => target.dataset.action,
      end,
      start,
    });
    const target = pressTarget("first");

    controller.handlePointerDown(pointerEvent("pointerdown", target, 1));
    window.dispatchEvent(pointerEvent("pointerup", window, 1));

    expect(start).toHaveBeenCalledWith("first");
    expect(end).toHaveBeenCalledWith("first", false);
  });

  it("cancels a stranded press when a new touch begins", () => {
    const start = vi.fn();
    const end = vi.fn();
    const controller = new PressInteractionController<string>(host(), {
      actionFor: (target) => target.dataset.action,
      end,
      start,
    });
    const first = pressTarget("first");
    const second = pressTarget("second");

    controller.handlePointerDown(pointerEvent("pointerdown", first, 1));
    controller.handlePointerDown(pointerEvent("pointerdown", second, 2));

    expect(end).toHaveBeenCalledWith("first", true);
    expect(start).toHaveBeenNthCalledWith(2, "second");
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

function pressTarget(action: string): HTMLElement {
  const target = document.createElement("button");
  target.dataset.action = action;
  Object.assign(target, {
    hasPointerCapture: vi.fn(() => false),
    releasePointerCapture: vi.fn(),
    setPointerCapture: vi.fn(),
  });
  document.body.append(target);
  return target;
}

function pointerEvent(
  type: string,
  currentTarget: EventTarget,
  pointerId: number,
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    currentTarget: { configurable: true, value: currentTarget },
    isPrimary: { value: true },
    pointerId: { value: pointerId },
    pointerType: { value: "touch" },
  });
  return event as PointerEvent;
}
