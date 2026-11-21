import { html, LitElement, nothing } from "lit";

import {
  EXPORT_NAME_CLOSE_EVENT,
  EXPORT_NAME_CONFIRM_EVENT,
  EXPORT_NAME_DIALOG_TAG,
} from "../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { buttonBaseStyles } from "../../ui/controls/button.styles";
import { centerDialogOnCard } from "../../ui/popover/dialog-position";
import { MAX_EXPORT_TITLE_LENGTH, normalizeExportTitle } from "./title";
import { exportNameDialogStyles } from "./export-name-dialog.styles";

export interface ExportNameDraft {
  readonly name: string;
}

export interface ExportNameConfirmation {
  readonly name: string;
}

export class ExportNameDialog extends LitElement {
  public static properties = {
    draft: { attribute: false },
    localize: { attribute: false },
    submitting: { attribute: false, type: Boolean },
    variant: { reflect: true },
    _name: { state: true },
  };

  public localize: LocalizeFunction = englishLocalize;
  public submitting = false;
  public variant: "review" | "segment" = "review";

  private _draft?: ExportNameDraft;
  private _name = "";

  public get draft(): ExportNameDraft | undefined {
    return this._draft;
  }

  public set draft(value: ExportNameDraft | undefined) {
    const previous = this._draft;
    if (value === previous) return;
    this._draft = value;
    this._name = value?.name ?? "";
    this.requestUpdate("draft", previous);
  }

  protected render() {
    const segment = this.variant === "segment";
    return html`<dialog
      aria-labelledby="export-heading"
      @cancel=${this._close}
      @click=${this._dialogClick}
      @pointerdown=${this._dialogPointerDown}
    >
      ${
        this.draft
          ? html`<form @submit=${this._confirm}>
              <header>
                <h2 id="export-heading">
                  ${this.localize(
                    segment
                      ? "recording_segments.export_title"
                      : "reviews.export_title",
                  )}
                </h2>
              </header>
              <section>
                <p>
                  ${this.localize(
                    segment
                      ? "recording_segments.export_explanation"
                      : "reviews.export_explanation",
                  )}
                </p>
                <label>
                  <span>${this.localize("exports.title")}</span>
                  <input
                    name="title"
                    maxlength=${String(MAX_EXPORT_TITLE_LENGTH)}
                    required
                    .value=${this._name}
                    @input=${this._titleChanged}
                  />
                </label>
              </section>
              <footer>
                <button
                  class="wzc-button"
                  type="button"
                  data-export-action="close"
                  ?disabled=${this.submitting}
                >
                  ${this.localize("exports.cancel")}
                </button>
                <button
                  class="wzc-button primary"
                  type="submit"
                  data-export-action="confirm"
                  ?disabled=${
                    this.submitting || !normalizeExportTitle(this._name)
                  }
                >
                  ${this.localize(
                    segment
                      ? "recording_segments.export_confirm"
                      : "reviews.export_confirm",
                  )}
                </button>
              </footer>
            </form>`
          : nothing
      }
    </dialog>`;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    const dialog = this.renderRoot.querySelector("dialog");
    if (!dialog || !changed.has("draft")) return;
    if (this.draft && !dialog.open) {
      dialog.showModal();
      centerDialogOnCard(this, dialog);
    } else if (!this.draft && dialog.open) {
      dialog.close();
    }
  }

  private readonly _titleChanged = (event: InputEvent): void => {
    const input = event.currentTarget as HTMLInputElement;
    const sanitized = normalizeExportTitle(input.value);
    if (input.value !== sanitized) input.value = sanitized;
    this._name = sanitized;
  };

  private readonly _confirm = (event: Event): void => {
    event.preventDefault();
    const name = normalizeExportTitle(this._name);
    if (!name || this.submitting) return;
    this.dispatchEvent(
      new CustomEvent<ExportNameConfirmation>(EXPORT_NAME_CONFIRM_EVENT, {
        bubbles: true,
        composed: true,
        detail: { name },
      }),
    );
  };

  private readonly _dialogClick = (event: MouseEvent): void => {
    if (event.target === event.currentTarget) {
      this._close(event);
      return;
    }
    const action = (event.target as Element | null)?.closest<HTMLButtonElement>(
      "button[data-export-action]",
    )?.dataset.exportAction;
    if (action === "close") this._close(event);
    if (action === "confirm") this._confirm(event);
  };

  private readonly _dialogPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const action = (event.target as Element | null)?.closest<HTMLButtonElement>(
      "button[data-export-action]",
    )?.dataset.exportAction;
    if (action === "confirm") this._confirm(event);
  };

  private readonly _close = (event: Event): void => {
    event.preventDefault();
    if (this.submitting) return;
    this.dispatchEvent(
      new CustomEvent(EXPORT_NAME_CLOSE_EVENT, {
        bubbles: true,
        composed: true,
      }),
    );
  };

  static styles = [buttonBaseStyles, exportNameDialogStyles];
}

if (!customElements.get(EXPORT_NAME_DIALOG_TAG)) {
  customElements.define(EXPORT_NAME_DIALOG_TAG, ExportNameDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    [EXPORT_NAME_DIALOG_TAG]: ExportNameDialog;
  }

  interface HTMLElementEventMap {
    [EXPORT_NAME_CLOSE_EVENT]: CustomEvent<void>;
    [EXPORT_NAME_CONFIRM_EVENT]: CustomEvent<ExportNameConfirmation>;
  }
}
