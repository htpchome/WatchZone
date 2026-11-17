import { html, LitElement } from "lit";

import { SCROLL_TOP_TAG } from "../core/constants";
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
