import { afterEach, describe, expect, it, vi } from "vitest";

import { ACCORDION_ITEM_TAG, ACCORDION_TAG } from "../src/core/constants";
import type { Accordion, AccordionItem } from "../src/ui/accordion";
import "../src/ui/accordion";

function createItem(key: string): AccordionItem {
  const item = document.createElement(ACCORDION_ITEM_TAG) as AccordionItem;
  item.itemKey = key;
  item.heading = `${key} settings`;
  return item;
}

function openItem(item: AccordionItem): void {
  const details = item.shadowRoot?.querySelector("details");
  if (!details) throw new Error("Accordion item was not rendered");
  details.open = true;
  details.dispatchEvent(new Event("toggle"));
}

describe("shared accordion", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts closed and keeps only one item open", async () => {
    const accordion = document.createElement(ACCORDION_TAG) as Accordion;
    const first = createItem("first");
    const second = createItem("second");
    accordion.append(first, second);
    document.body.append(accordion);
    await Promise.all([
      accordion.updateComplete,
      first.updateComplete,
      second.updateComplete,
    ]);

    expect(first.open).toBe(false);
    expect(second.open).toBe(false);
    openItem(first);
    openItem(second);

    expect(first.open).toBe(false);
    expect(second.open).toBe(true);
  });

  it("can start with one configured item open", async () => {
    const accordion = document.createElement(ACCORDION_TAG) as Accordion;
    accordion.initialOpen = "second";
    const first = createItem("first");
    const second = createItem("second");
    accordion.append(first, second);
    document.body.append(accordion);
    await Promise.all([
      accordion.updateComplete,
      first.updateComplete,
      second.updateComplete,
    ]);

    expect(first.open).toBe(false);
    expect(second.open).toBe(true);
  });

  it("aligns an opened item only when its content does not fit", async () => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback): number => {
        callback(0);
        return 1;
      },
    );
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    Object.defineProperties(scroller, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 400 },
    });
    const scrollBy = vi.fn();
    Object.defineProperty(scroller, "scrollBy", { value: scrollBy });
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      top: 0,
    } as DOMRect);
    const accordion = document.createElement(ACCORDION_TAG) as Accordion;
    const first = createItem("first");
    const second = createItem("second");
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue({
      bottom: 220,
      top: 80,
    } as DOMRect);
    vi.spyOn(second, "getBoundingClientRect").mockReturnValue({
      bottom: 250,
      top: 220,
    } as DOMRect);
    accordion.append(first, second);
    scroller.append(accordion);
    document.body.append(scroller);
    await accordion.updateComplete;

    openItem(first);
    await first.updateComplete;

    expect(scrollBy).toHaveBeenCalledWith({ behavior: "auto", top: 80 });
  });
});
