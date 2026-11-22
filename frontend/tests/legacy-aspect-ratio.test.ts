import type { ReactiveController, ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LegacyAspectRatioController } from "../src/ui/media-overlay/legacy-aspect-ratio.controller";

class TestHost implements ReactiveControllerHost {
  public controller?: ReactiveController;

  public addController(controller: ReactiveController): void {
    this.controller = controller;
  }

  public removeController(): void {}

  public requestUpdate(): void {}

  public readonly updateComplete = Promise.resolve(true);
}

describe("LegacyAspectRatioController", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maintains a pixel height when native aspect-ratio is unavailable", () => {
    let resize: ResizeObserverCallback | undefined;
    const unobserve = vi.fn();
    vi.stubGlobal("CSS", { supports: () => false });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        public constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }

        public observe(): void {}

        public unobserve(element: Element): void {
          unobserve(element);
        }

        public disconnect(): void {}
      },
    );

    const host = new TestHost();
    const controller = new LegacyAspectRatioController(host);
    const element = document.createElement("div");
    let width = 320;
    vi.spyOn(element, "getBoundingClientRect").mockImplementation(
      () => ({ width }) as DOMRect,
    );

    controller.observe(element);
    expect(element.style.height).toBe("180px");

    width = 400;
    resize?.([], {} as ResizeObserver);
    expect(element.style.height).toBe("225px");

    host.controller?.hostDisconnected?.();
    expect(unobserve).toHaveBeenCalledWith(element);
    expect(element.style.height).toBe("");
  });

  it("does not override native aspect-ratio sizing", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const host = new TestHost();
    const controller = new LegacyAspectRatioController(host);
    const element = document.createElement("div");

    controller.observe(element);

    expect(element.style.height).toBe("");
  });
});
