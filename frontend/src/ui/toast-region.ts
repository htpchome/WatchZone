import { html, LitElement } from "lit";

import { TOAST_REGION_TAG } from "../core/constants";
import type { ToastNotice } from "./toast-manager";
import { renderIcon } from "./icons";
import { toastRegionStyles } from "./toast-region.styles";

export type ToastRegionMode = "inline" | "overlay";

/** Shared toast presentation for overlays and inline application surfaces. */
export class ToastRegion extends LitElement {
  public static properties = {
    mode: { reflect: true },
    notices: { attribute: false },
  };

  public mode: ToastRegionMode = "overlay";
  public notices: readonly ToastNotice[] = [];

  protected render() {
    return this.notices.map(
      (notice) =>
        html`<div
          class="toast"
          data-severity=${notice.severity}
          ?data-dismissing=${notice.dismissing}
          role=${notice.severity === "success" ? "status" : "alert"}
          aria-atomic="true"
        >
          ${
            notice.icon
              ? html`<span class="toast-icon">${renderIcon(notice.icon)}</span>`
              : null
          }
          <span>${notice.message}</span>
        </div>`,
    );
  }

  static styles = toastRegionStyles;
}

if (!customElements.get(TOAST_REGION_TAG)) {
  customElements.define(TOAST_REGION_TAG, ToastRegion);
}

declare global {
  interface HTMLElementTagNameMap {
    [TOAST_REGION_TAG]: ToastRegion;
  }
}
