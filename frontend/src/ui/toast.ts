import { html, LitElement } from "lit";

import { TimedVisibilityController } from "./timed-visibility.controller";
import { toastStyles } from "./toast.styles";

export const DEFAULT_TOAST_DURATION_MS = 4000;

export type ToastCategory = "error" | "neutral" | "success" | "warning";
export type ToastPlacement =
  | "bottom-center"
  | "bottom-end"
  | "bottom-start"
  | "top-center"
  | "top-end"
  | "top-start";
export type ToastPresentation = "inline" | "overlay";

export interface ToastOptions {
  readonly category?: ToastCategory;
  readonly durationMs?: number;
  readonly persistent?: boolean;
  readonly placement?: ToastPlacement;
  readonly presentation?: ToastPresentation;
}

/** Reusable categorized feedback with one lifecycle-safe visibility policy. */
export class ToastElement extends LitElement {
  public static properties = {
    placement: { reflect: true, type: String },
    presentation: { reflect: true, type: String },
  };

  public placement: ToastPlacement = "bottom-center";
  public presentation: ToastPresentation = "overlay";

  private _category: ToastCategory = "neutral";
  private _message = "";
  private readonly _visibility = new TimedVisibilityController(
    this,
    DEFAULT_TOAST_DURATION_MS,
  );

  public show(message: string, options: ToastOptions = {}): void {
    this._message = message;
    this._category = options.category ?? "neutral";
    this.placement = options.placement ?? "bottom-center";
    this.presentation = options.presentation ?? "overlay";
    if (options.persistent) {
      this._visibility.reveal();
    } else {
      this._visibility.revealFor(
        options.durationMs ?? DEFAULT_TOAST_DURATION_MS,
      );
    }
    this.requestUpdate();
  }

  public dismiss(): void {
    this._visibility.hide();
  }

  protected render() {
    const assertive = this._category === "error";
    return html`<div
      class="toast ${this._category} ${
        this._visibility.visible ? "visible" : ""
      }"
      role=${assertive ? "alert" : "status"}
      aria-live=${assertive ? "assertive" : "polite"}
      aria-hidden=${this._visibility.visible ? "false" : "true"}
    >
      ${this._message}
    </div>`;
  }

  static styles = toastStyles;
}

if (!customElements.get("watchzone-toast")) {
  customElements.define("watchzone-toast", ToastElement);
}

declare global {
  interface HTMLElementTagNameMap {
    "watchzone-toast": ToastElement;
  }
}
