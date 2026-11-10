import { html, LitElement } from "lit";

import { MEDIA_DAY_HEADER_TAG } from "../core/constants";
import { mediaDayHeaderStyles } from "./media-day-header.styles";

/** Shared sticky date heading for media-list scroll surfaces. */
export class MediaDayHeader extends LitElement {
  public static properties = {
    label: { type: String },
  };

  public label = "";

  protected render() {
    return html`
      <slot name="previous"></slot>
      <div class="label" role="heading" aria-level="3">${this.label}</div>
      <slot name="next"></slot>
    `;
  }

  static styles = mediaDayHeaderStyles;
}

if (!customElements.get(MEDIA_DAY_HEADER_TAG)) {
  customElements.define(MEDIA_DAY_HEADER_TAG, MediaDayHeader);
}

declare global {
  interface HTMLElementTagNameMap {
    [MEDIA_DAY_HEADER_TAG]: MediaDayHeader;
  }
}
