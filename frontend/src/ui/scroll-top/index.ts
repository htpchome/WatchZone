import {
  html,
  LitElement,
  type ReactiveController,
  type ReactiveControllerHost,
} from "lit";

import { SCROLL_TOP_TAG } from "../../core/constants";
import { scrollTopStyles } from "./scroll-top.styles";

const MIN_SCROLL_TOP_OFFSET = 64;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Returns whether a bounded media viewport has passed about two tiles. */
export function shouldShowScrollTop(scroller: HTMLElement): boolean {
  if (scroller.scrollHeight <= scroller.clientHeight + 1) return false;
  const tile = scroller.querySelector<HTMLElement>(".tile");
  const tileHeight = tile?.getBoundingClientRect().height ?? 0;
  return scroller.scrollTop >= Math.max(MIN_SCROLL_TOP_OFFSET, tileHeight * 2);
}

/** Smoothly return one bounded media viewport to its beginning. */
export function scrollMediaViewportToTop(scroller: HTMLElement): void {
  scroller.scrollTo({
    behavior:
      typeof matchMedia === "function" &&
      matchMedia(REDUCED_MOTION_QUERY).matches
        ? "auto"
        : "smooth",
    top: 0,
  });
}

/** Keeps one retained media viewport's Top action synchronized across reconnects. */
export class ScrollTopVisibilityController implements ReactiveController {
  public visible = false;
  private _frame?: number;
  private _renderOnConnect = false;

  public constructor(
    private readonly _host: ReactiveControllerHost & HTMLElement,
    private readonly _getScroller: () => HTMLElement | null,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    if (this._renderOnConnect) {
      this._renderOnConnect = false;
      this._host.requestUpdate();
    }
    this.schedule();
  }

  public hostUpdated(): void {
    this.schedule();
  }

  public hostDisconnected(): void {
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = undefined;
    if (this.visible) {
      this.visible = false;
      this._renderOnConnect = true;
    }
  }

  public schedule(): void {
    if (this._frame !== undefined) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = undefined;
      if (this._host.isConnected) this.sync();
    });
  }

  public sync(scroller: HTMLElement | null = this._getScroller()): void {
    const visible = scroller ? shouldShowScrollTop(scroller) : false;
    if (visible === this.visible) return;
    this.visible = visible;
    this._host.requestUpdate();
  }
}

/** Shared floating action for bounded Reviews, Events, Recordings, and Exports. */
export class ScrollTop extends LitElement {
  public static properties = {
    label: { type: String },
  };

  public label = "";

  protected render() {
    return html`<button
      type="button"
      title=${this.label}
      aria-label=${this.label}
    >
      <ha-icon icon="mdi:arrow-up" aria-hidden="true"></ha-icon>
      <span>${this.label}</span>
    </button>`;
  }

  public static styles = scrollTopStyles;
}

if (!customElements.get(SCROLL_TOP_TAG)) {
  customElements.define(SCROLL_TOP_TAG, ScrollTop);
}

declare global {
  interface HTMLElementTagNameMap {
    [SCROLL_TOP_TAG]: ScrollTop;
  }
}
