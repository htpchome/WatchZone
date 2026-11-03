import { html, LitElement } from "lit";

import { BADGE_TAG } from "../core/constants";
import type { BadgeColor } from "./badge-colors";
import { badgeStyles } from "./badge.styles";

export type BadgeAppearance = "filled" | "filled-outlined" | "outlined";
export type BadgeShape = "pill" | "rounded" | "square";
export type BadgeSize = "large" | "medium" | "small";
export type BadgeVariant =
  "accent" | "danger" | "neutral" | "success" | "warning";

/** Shared compact label primitive; object-to-color policy lives separately. */
export class Badge extends LitElement {
  public static properties = {
    appearance: { reflect: true },
    color: { reflect: true },
    shape: { reflect: true },
    size: { reflect: true },
    variant: { reflect: true },
  };

  public appearance: BadgeAppearance = "filled";
  public color?: BadgeColor;
  public shape: BadgeShape = "rounded";
  public size: BadgeSize = "small";
  public variant: BadgeVariant = "neutral";

  protected render() {
    return html`<span class="badge" part="badge"><slot></slot></span>`;
  }

  static styles = badgeStyles;
}

if (!customElements.get(BADGE_TAG)) {
  customElements.define(BADGE_TAG, Badge);
}

declare global {
  interface HTMLElementTagNameMap {
    [BADGE_TAG]: Badge;
  }
}
