import { afterEach, describe, expect, it } from "vitest";

import { SCROLL_TOP_TAG } from "../src/core/constants";
import { ScrollTop, shouldShowScrollTop } from "../src/ui/scroll-top";

describe("scroll-to-top control", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("appears only after a scrolling viewport passes two rendered tiles", () => {
    const scroller = document.createElement("div");
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.getBoundingClientRect = () => ({ height: 100 }) as DOMRect;
    scroller.append(tile);
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, value: 199, writable: true },
    });

    expect(shouldShowScrollTop(scroller)).toBe(false);
    scroller.scrollTop = 200;
    expect(shouldShowScrollTop(scroller)).toBe(true);

    Object.defineProperty(scroller, "scrollHeight", {
      configurable: true,
      value: 300,
    });
    expect(shouldShowScrollTop(scroller)).toBe(false);
  });

  it("renders one labeled native button", async () => {
    const control = document.createElement(SCROLL_TOP_TAG) as ScrollTop;
    control.label = "Top";
    document.body.append(control);
    await control.updateComplete;

    const button = control.shadowRoot?.querySelector("button");
    expect(button?.textContent?.trim()).toBe("Top");
    expect(button?.getAttribute("aria-label")).toBe("Top");
  });
});
