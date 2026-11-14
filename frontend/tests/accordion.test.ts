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

function closeItem(item: AccordionItem): void {
  const details = item.shadowRoot?.querySelector("details");
  if (!details) throw new Error("Accordion item was not rendered");
  details.open = false;
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

  it("can require exactly one item to remain open", async () => {
    const accordion = document.createElement(ACCORDION_TAG) as Accordion;
    accordion.initialOpen = "first";
    accordion.requireOpen = true;
    const first = createItem("first");
    const second = createItem("second");
    accordion.append(first, second);
    document.body.append(accordion);
    await Promise.all([
      accordion.updateComplete,
      first.updateComplete,
      second.updateComplete,
    ]);

    expect(first.open).toBe(true);
    expect(second.open).toBe(false);
    closeItem(first);
    expect(first.open).toBe(true);
    openItem(second);
    expect(first.open).toBe(false);
    expect(second.open).toBe(true);
    closeItem(second);
    expect(second.open).toBe(true);
  });

  it("prevents the sole open item from entering a native close cycle", async () => {
    const accordion = document.createElement(ACCORDION_TAG) as Accordion;
    accordion.initialOpen = "first";
    accordion.requireOpen = true;
    const first = createItem("first");
    const second = createItem("second");
    accordion.append(first, second);
    document.body.append(accordion);
    await Promise.all([
      accordion.updateComplete,
      first.updateComplete,
      second.updateComplete,
    ]);

    const summary = first.shadowRoot?.querySelector("summary");
    if (!summary) throw new Error("Accordion summary was not rendered");
    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
    });

    expect(summary.dispatchEvent(click)).toBe(false);
    expect(click.defaultPrevented).toBe(true);
    expect(first.open).toBe(true);

    const nestedDetails = document.createElement("details");
    const nestedSummary = document.createElement("summary");
    nestedDetails.append(nestedSummary);
    first.append(nestedDetails);
    const nestedClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    expect(nestedSummary.dispatchEvent(nestedClick)).toBe(true);
    expect(nestedClick.defaultPrevented).toBe(false);
  });

  it("ignores disclosure events from nested accordions", async () => {
    const outer = document.createElement(ACCORDION_TAG) as Accordion;
    const outerItem = createItem("outer");
    const sibling = createItem("sibling");
    const inner = document.createElement(ACCORDION_TAG) as Accordion;
    const innerItem = createItem("inner");
    inner.append(innerItem);
    outerItem.append(inner);
    outer.append(outerItem, sibling);
    document.body.append(outer);
    await Promise.all([
      outer.updateComplete,
      outerItem.updateComplete,
      sibling.updateComplete,
      inner.updateComplete,
      innerItem.updateComplete,
    ]);

    openItem(outerItem);
    openItem(innerItem);

    expect(outerItem.open).toBe(true);
    expect(sibling.open).toBe(false);
    expect(innerItem.open).toBe(true);
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
