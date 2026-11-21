import { html, LitElement } from "lit";

import {
  ACCORDION_ITEM_TAG,
  ACCORDION_TAG,
  ACCORDION_TOGGLE_EVENT,
} from "../../core/constants";
import { renderIcon, type IconName } from "../icons";
import {
  motionDurations,
  motionEasings,
  OwnedMotion,
  reducedMotionRequested,
} from "../motion";
import { OwnedValueMotion } from "../motion/value";
import { accordionItemStyles, accordionStyles } from "./accordion.styles";

export interface AccordionToggleDetail {
  readonly item: AccordionItem;
  readonly open: boolean;
}

function composedParent(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

interface ScrollPort {
  readonly bottom: number;
  readonly jumpBy: (top: number) => void;
  readonly scrollPosition: () => number;
  readonly setScrollPosition: (value: number) => void;
  readonly top: number;
}

function scrollPort(element: Element): ScrollPort | undefined {
  for (
    let parent = composedParent(element);
    parent;
    parent = composedParent(parent)
  ) {
    const overflow = getComputedStyle(parent).overflowY;
    if (
      /auto|scroll|overlay/.test(overflow) &&
      parent.scrollHeight > parent.clientHeight
    ) {
      const rect = parent.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        jumpBy: (top) => parent.scrollBy({ behavior: "auto", top }),
        scrollPosition: () => parent.scrollTop,
        setScrollPosition: (value) => {
          parent.scrollTop = value;
        },
        top: rect.top,
      };
    }
  }
  const documentObject = element.ownerDocument;
  const scrollingElement = documentObject.scrollingElement;
  const windowObject = documentObject.defaultView;
  if (
    scrollingElement &&
    windowObject &&
    scrollingElement.scrollHeight > documentObject.documentElement.clientHeight
  ) {
    return {
      bottom: windowObject.innerHeight,
      jumpBy: (top) => windowObject.scrollBy({ behavior: "auto", top }),
      scrollPosition: () => windowObject.scrollY,
      setScrollPosition: (value) => windowObject.scrollTo(0, value),
      top: 0,
    };
  }
  return undefined;
}

export class AccordionItem extends LitElement {
  public static properties = {
    density: { reflect: true, type: String },
    heading: { type: String },
    icon: { attribute: false },
    itemKey: { attribute: "item-key", type: String },
    open: { type: Boolean },
    summaryText: { attribute: "summary-text", type: String },
  };

  public density: "comfortable" | "compact" = "comfortable";
  public heading = "";
  public icon?: IconName;
  public itemKey = "";
  public open = false;
  public summaryText = "";
  private readonly _chevronMotion = new OwnedMotion();
  private _renderedOpen?: boolean;

  public setOpen(open: boolean): void {
    this.open = open;
    const details = this.renderRoot.querySelector("details");
    if (details && details.open !== open) details.open = open;
  }

  protected render() {
    return html`
      <details .open=${this.open} @toggle=${this._handleToggle}>
        <summary>
          ${
            this.icon
              ? html`<span class="icon">${renderIcon(this.icon)}</span>`
              : html`<slot name="icon"></slot>`
          }
          <span class="heading">${this.heading}</span>
          ${
            this.summaryText
              ? html`<span class="summary-text">${this.summaryText}</span>`
              : ""
          }
          <span class="chevron">${renderIcon("chevronDown")}</span>
        </summary>
        <div class="content"><slot></slot></div>
      </details>
    `;
  }

  protected updated(): void {
    const chevron = this.renderRoot.querySelector<HTMLElement>(".chevron");
    if (
      chevron &&
      this._renderedOpen !== undefined &&
      this._renderedOpen !== this.open
    ) {
      this._chevronMotion.start(
        chevron,
        { transform: this.open ? "rotate(180deg)" : "rotate(0deg)" },
        { duration: motionDurations.standard, ease: motionEasings.standard },
      );
    }
    this._renderedOpen = this.open;
  }

  public disconnectedCallback(): void {
    this._chevronMotion.cancel();
    super.disconnectedCallback();
  }

  private readonly _handleToggle = (event: Event): void => {
    const open = (event.currentTarget as HTMLDetailsElement).open;
    if (this.open === open) return;
    this.open = open;
    this.dispatchEvent(
      new CustomEvent<AccordionToggleDetail>(ACCORDION_TOGGLE_EVENT, {
        bubbles: true,
        composed: true,
        detail: { item: this, open },
      }),
    );
  };

  static styles = accordionItemStyles;
}

export class Accordion extends LitElement {
  public static properties = {
    initialOpen: { attribute: "initial-open", type: String },
  };

  public initialOpen?: string;
  private _initialized = false;
  private _revealFrame?: number;
  private _revealRequest = 0;
  private readonly _scrollMotion = new OwnedValueMotion();

  public connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener(
      ACCORDION_TOGGLE_EVENT,
      this._handleItemToggle as EventListener,
    );
  }

  public disconnectedCallback(): void {
    this.removeEventListener(
      ACCORDION_TOGGLE_EVENT,
      this._handleItemToggle as EventListener,
    );
    this._cancelReveal();
    this._scrollMotion.cancel();
    super.disconnectedCallback();
  }

  protected render() {
    return html`<slot @slotchange=${this._handleSlotChange}></slot>`;
  }

  private get _items(): AccordionItem[] {
    const slot = this.renderRoot.querySelector("slot");
    return (slot?.assignedElements({ flatten: true }) ?? []).filter(
      (element): element is AccordionItem => element instanceof AccordionItem,
    );
  }

  private readonly _handleSlotChange = (): void => {
    if (this._initialized) {
      this._enforceSingleOpen();
      return;
    }
    this._initialized = true;
    for (const item of this._items) {
      item.open = Boolean(
        this.initialOpen && item.itemKey === this.initialOpen,
      );
    }
  };

  private _enforceSingleOpen(): void {
    let foundOpen = false;
    for (const item of this._items) {
      if (!item.open) continue;
      if (foundOpen) item.setOpen(false);
      else foundOpen = true;
    }
  }

  private readonly _handleItemToggle = (
    event: CustomEvent<AccordionToggleDetail>,
  ): void => {
    const items = this._items;
    if (!items.includes(event.detail.item)) return;
    this._cancelReveal();
    const opened = event.detail.item;
    if (!event.detail.open) return;
    for (const item of items) {
      if (item !== opened) item.setOpen(false);
    }
    const revealRequest = this._revealRequest;
    void opened.updateComplete.then(() => {
      if (!this.isConnected || revealRequest !== this._revealRequest) return;
      this._revealFrame = requestAnimationFrame(() => {
        this._revealFrame = undefined;
        if (revealRequest === this._revealRequest) this._reveal(opened);
      });
    });
  };

  private _cancelReveal(): void {
    this._revealRequest += 1;
    if (this._revealFrame === undefined) return;
    cancelAnimationFrame(this._revealFrame);
    this._revealFrame = undefined;
  }

  private _reveal(opened: AccordionItem): void {
    const port = scrollPort(opened);
    if (!port) return;
    const items = this._items;
    const next = items[items.indexOf(opened) + 1];
    const openedRect = opened.getBoundingClientRect();
    const requiredBottom =
      next?.getBoundingClientRect().bottom ?? openedRect.bottom;
    if (openedRect.top >= port.top && requiredBottom <= port.bottom) {
      return;
    }
    const start = port.scrollPosition();
    const delta = openedRect.top - port.top;
    if (reducedMotionRequested()) {
      port.jumpBy(delta);
      return;
    }
    this._scrollMotion.start(start, start + delta, {
      duration: motionDurations.settle,
      ease: motionEasings.standard,
      onUpdate: (value) => port.setScrollPosition(value),
    });
  }

  static styles = accordionStyles;
}

if (!customElements.get(ACCORDION_ITEM_TAG)) {
  customElements.define(ACCORDION_ITEM_TAG, AccordionItem);
}
if (!customElements.get(ACCORDION_TAG)) {
  customElements.define(ACCORDION_TAG, Accordion);
}

declare global {
  interface HTMLElementTagNameMap {
    [ACCORDION_ITEM_TAG]: AccordionItem;
    [ACCORDION_TAG]: Accordion;
  }
}
