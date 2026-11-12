import { html, LitElement, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";

import {
  SEGMENTED_CONTROL_TAG,
  SEGMENTED_CONTROL_VALUE_EVENT,
} from "../core/constants";
import { segmentedControlStyles } from "./segmented-control.styles";
import { renderIcon, type IconName } from "./icons";

export interface SegmentedControlOption {
  readonly accessibleLabel?: string;
  readonly disabled?: boolean;
  readonly indicator?: {
    readonly icon: IconName;
    readonly tone: "danger" | "warning";
  };
  readonly label: string;
  readonly value: string;
}

export interface SegmentedControlValueDetail {
  readonly value: string;
}

export type SegmentedControlMode = "radio" | "tab";
export type SegmentedControlAppearance = "compact" | "navigation";

/** Shared single-selection control with radio-group or tab-list semantics. */
export class SegmentedControl extends LitElement {
  public static properties = {
    appearance: { reflect: true, type: String },
    label: { type: String },
    mode: { reflect: true, type: String },
    options: { attribute: false },
    value: { type: String },
  };

  public appearance: SegmentedControlAppearance = "compact";
  public label = "";
  public mode: SegmentedControlMode = "radio";
  public options: readonly SegmentedControlOption[] = [];
  public value = "";

  protected render() {
    const selectedIndex = this.options.findIndex(
      ({ disabled, value }) => !disabled && value === this.value,
    );
    const fallbackIndex = this.options.findIndex(({ disabled }) => !disabled);
    return html`<div
      class="segmented-control"
      part="container"
      role=${this.mode === "tab" ? "tablist" : "radiogroup"}
      aria-label=${this.label}
    >
      ${repeat(
        this.options,
        ({ value }) => value,
        (
          { accessibleLabel, disabled = false, indicator, label, value },
          index,
        ) => {
          const selected = value === this.value;
          const tabbable =
            index === (selectedIndex >= 0 ? selectedIndex : fallbackIndex);
          return html`<button
            class="segmented-control-option"
            part=${`option${selected ? " selected" : ""}${
              disabled ? " disabled" : ""
            }`}
            type="button"
            role=${this.mode === "tab" ? "tab" : "radio"}
            data-value=${value}
            aria-selected=${this.mode === "tab" ? String(selected) : nothing}
            aria-checked=${this.mode === "radio" ? String(selected) : nothing}
            aria-label=${accessibleLabel ?? nothing}
            tabindex=${tabbable ? "0" : "-1"}
            ?disabled=${disabled}
            @click=${this._handleClick}
            @keydown=${this._handleKeyDown}
          >
            <span class="option-content">
              ${
                indicator
                  ? html`<span
                      class=${`option-indicator ${indicator.tone}`}
                      aria-hidden="true"
                      >${renderIcon(indicator.icon)}</span
                    >`
                  : nothing
              }
              <span class="option-label">${label}</span>
            </span>
          </button>`;
        },
      )}
    </div>`;
  }

  private _select(value: string): void {
    const option = this.options.find((candidate) => candidate.value === value);
    if (!option || option.disabled || value === this.value) return;
    this.dispatchEvent(
      new CustomEvent<SegmentedControlValueDetail>(
        SEGMENTED_CONTROL_VALUE_EVENT,
        {
          bubbles: true,
          composed: true,
          detail: { value },
        },
      ),
    );
  }

  private readonly _handleClick = (event: Event): void => {
    this._select((event.currentTarget as HTMLElement).dataset.value ?? "");
  };

  private readonly _handleKeyDown = (event: KeyboardEvent): void => {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    const enabled = this.options.filter(({ disabled }) => !disabled);
    if (enabled.length === 0) return;
    const current = enabled.findIndex(({ value }) => value === this.value);
    const backwards = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabled.length - 1
          : current < 0
            ? 0
            : (current + (backwards ? -1 : 1) + enabled.length) %
              enabled.length;
    const next = enabled[index];
    if (!next) return;
    event.preventDefault();
    this._select(next.value);
    void this.updateComplete.then(() => {
      [...this.renderRoot.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.dataset.value === next.value)
        ?.focus();
    });
  };

  static styles = segmentedControlStyles;
}

if (!customElements.get(SEGMENTED_CONTROL_TAG)) {
  customElements.define(SEGMENTED_CONTROL_TAG, SegmentedControl);
}

declare global {
  interface HTMLElementTagNameMap {
    [SEGMENTED_CONTROL_TAG]: SegmentedControl;
  }
}
