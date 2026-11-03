import { html, LitElement } from "lit";

import {
  ACCORDION_ITEM_TAG,
  ACCORDION_TAG,
  ACCORDION_TOGGLE_EVENT,
} from "../core/constants";
import { renderIcon, type IconName } from "./icons";
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
  readonly scrollBy: (options: ScrollToOptions) => void;
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
        scrollBy: (options) => parent.scrollBy(options),
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
      scrollBy: (options) => windowObject.scrollBy(options),
      top: 0,
    };
  }
  return undefined;
}

export class AccordionItem extends LitElement {
  public static properties = {
    heading: { type: String },
    icon: { attribute: false },
    itemKey: { attribute: "item-key", type: String },
    open: { type: Boolean },
  };

  public heading = "";
  public icon?: IconName;
  public itemKey = "";
  public open = false;

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
          <span class="chevron">${renderIcon("chevronDown")}</span>
        </summary>
        <div class="content"><slot></slot></div>
      </details>
    `;
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
      if (foundOpen) item.open = false;
      else foundOpen = true;
    }
  }

  private readonly _handleItemToggle = (
    event: CustomEvent<AccordionToggleDetail>,
  ): void => {
    if (!event.detail.open) return;
    const opened = event.detail.item;
    for (const item of this._items) {
      if (item !== opened) item.open = false;
    }
    void opened.updateComplete.then(() => {
      requestAnimationFrame(() => this._reveal(opened));
    });
  };

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
    port.scrollBy({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      top: openedRect.top - port.top,
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
