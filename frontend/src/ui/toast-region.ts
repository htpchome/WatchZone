import { html, LitElement } from "lit";

import { TOAST_REGION_TAG } from "../core/constants";
import type { ToastNotice } from "./toast-manager";
import { motionDurations, motionEasings, OwnedMotion } from "./motion";
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
  private _iconLoad?: Promise<void>;
  private _renderIcon?: typeof import("./icons").renderIcon;
  private readonly _motions = new Map<
    string,
    { readonly motion: OwnedMotion; dismissing: boolean }
  >();

  protected render() {
    return this.notices.map(
      (notice) =>
        html`<div
          class="toast"
          data-toast-id=${notice.id}
          data-severity=${notice.severity}
          ?data-dismissing=${notice.dismissing}
          role=${notice.severity === "success" ? "status" : "alert"}
          aria-atomic="true"
        >
          ${
            notice.icon
              ? html`<span class="toast-icon"
                  >${this._renderIcon?.(notice.icon)}</span
                >`
              : null
          }
          <span>${notice.message}</span>
        </div>`,
    );
  }

  protected updated(): void {
    if (this.notices.some(({ icon }) => icon)) this._loadIcons();
    const activeIds = new Set(this.notices.map(({ id }) => id));
    for (const [id, state] of this._motions) {
      if (activeIds.has(id)) continue;
      state.motion.cancel();
      this._motions.delete(id);
    }
    const elements = this.renderRoot.querySelectorAll<HTMLElement>(".toast");
    for (const [index, notice] of this.notices.entries()) {
      const element = elements.item(index);
      if (!element) continue;
      let state = this._motions.get(notice.id);
      if (!state) {
        state = { motion: new OwnedMotion(), dismissing: notice.dismissing };
        this._motions.set(notice.id, state);
        state.motion.start(
          element,
          {
            opacity: notice.dismissing ? [1, 0] : [0, 1],
            transform: notice.dismissing
              ? ["translateY(0)", "translateY(0.25rem)"]
              : ["translateY(0.25rem)", "translateY(0)"],
          },
          {
            duration: motionDurations.standard,
            ease: motionEasings.out,
          },
        );
      } else if (state.dismissing !== notice.dismissing) {
        state.dismissing = notice.dismissing;
        state.motion.start(
          element,
          {
            opacity: notice.dismissing ? 0 : 1,
            transform: notice.dismissing
              ? "translateY(0.25rem)"
              : "translateY(0)",
          },
          {
            duration: motionDurations.standard,
            ease: motionEasings.standard,
          },
        );
      }
    }
  }

  private _loadIcons(): void {
    if (this._renderIcon || this._iconLoad) return;
    this._iconLoad = import("./icons")
      .then(({ renderIcon }) => {
        this._renderIcon = renderIcon;
        this.requestUpdate();
      })
      .catch((error: unknown) =>
        console.error("Failed to load toast icons", error),
      );
  }

  public disconnectedCallback(): void {
    for (const { motion } of this._motions.values()) motion.cancel();
    this._motions.clear();
    super.disconnectedCallback();
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
