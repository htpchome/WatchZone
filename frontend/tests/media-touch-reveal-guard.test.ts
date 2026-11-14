import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaTouchRevealGuard } from "../src/ui/media-touch-reveal-guard";

describe("media touch reveal guard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("suppresses only the click produced by the reveal touch", () => {
    vi.useFakeTimers();
    const guard = new MediaTouchRevealGuard();
    const pointer = { pointerId: 7 } as PointerEvent;
    const reachedTarget = vi.fn();
    document.body.addEventListener("click", reachedTarget, { once: true });

    guard.begin(pointer);
    guard.end(pointer);
    const revealClickAccepted = document.body.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(revealClickAccepted).toBe(false);
    expect(reachedTarget).not.toHaveBeenCalled();

    vi.runAllTimers();
    const deliberateClickAccepted = document.body.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    expect(deliberateClickAccepted).toBe(true);
    expect(reachedTarget).toHaveBeenCalledOnce();
  });
});
