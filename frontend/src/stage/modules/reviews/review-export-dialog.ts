import { html, LitElement, nothing } from "lit";

import {
  REVIEW_EXPORT_CLOSE_EVENT,
  REVIEW_EXPORT_CONFIRM_EVENT,
  REVIEW_EXPORT_DIALOG_TAG,
} from "../../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import {
  MAX_EXPORT_TITLE_LENGTH,
  normalizeExportTitle,
} from "../../../features/exports";
import { buttonBaseStyles } from "../../../ui/button.styles";
import { centerDialogOnCard } from "../../../ui/dialog-position";
import { reviewExportDialogStyles } from "./review-export-dialog.styles";

export interface ReviewExportDraft {
  readonly name: string;
}

export interface ReviewExportConfirmation {
  readonly name: string;
}

/** Reviews-owned confirmation and title editor for persistent exports. */
export class ReviewExportDialog extends LitElement {
  public static properties = {
    draft: { attribute: false },
    localize: { attribute: false },
    submitting: { attribute: false, type: Boolean },
    _name: { state: true },
  };

  public localize: LocalizeFunction = englishLocalize;
  public submitting = false;

  private _draft?: ReviewExportDraft;
  private _name = "";

  public get draft(): ReviewExportDraft | undefined {
    return this._draft;
  }

  public set draft(value: ReviewExportDraft | undefined) {
    const previous = this._draft;
    if (value === previous) return;
    this._draft = value;
    this._name = value?.name ?? "";
    this.requestUpdate("draft", previous);
  }

  protected render() {
    return html`<dialog
      aria-labelledby="export-heading"
      @cancel=${this._close}
      @click=${this._backdropClick}
    >
      ${
        this.draft
          ? html`<form @submit=${this._confirm}>
              <header>
                <h2 id="export-heading">
                  ${this.localize("reviews.export_title")}
                </h2>
              </header>
              <section>
                <p>${this.localize("reviews.export_explanation")}</p>
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
                  ?disabled=${this.submitting}
                  @click=${this._close}
                >
                  ${this.localize("exports.cancel")}
                </button>
                <button
                  class="wzc-button primary"
                  type="submit"
                  ?disabled=${
                    this.submitting || !normalizeExportTitle(this._name)
                  }
                >
                  ${this.localize("reviews.export_confirm")}
                </button>
              </footer>
            </form>`
          : nothing
      }
    </dialog>`;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    const dialog = this.renderRoot.querySelector("dialog");
    if (!dialog) return;
    if (changed.has("draft")) {
      if (this.draft && !dialog.open) {
        dialog.showModal();
        centerDialogOnCard(this, dialog);
      } else if (!this.draft && dialog.open) {
        dialog.close();
      }
    }
  }

  private readonly _titleChanged = (event: InputEvent): void => {
    const input = event.currentTarget as HTMLInputElement;
    const sanitized = normalizeExportTitle(input.value);
    if (input.value !== sanitized) input.value = sanitized;
    this._name = sanitized;
  };

  private readonly _confirm = (event: SubmitEvent): void => {
    event.preventDefault();
    const name = normalizeExportTitle(this._name);
    if (!name || this.submitting) return;
    this.dispatchEvent(
      new CustomEvent<ReviewExportConfirmation>(REVIEW_EXPORT_CONFIRM_EVENT, {
        bubbles: true,
        composed: true,
        detail: { name },
      }),
    );
  };

  private readonly _backdropClick = (event: MouseEvent): void => {
    if (event.target === event.currentTarget) this._close(event);
  };

  private readonly _close = (event: Event): void => {
    event.preventDefault();
    if (this.submitting) return;
    this.dispatchEvent(
      new CustomEvent(REVIEW_EXPORT_CLOSE_EVENT, {
        bubbles: true,
        composed: true,
      }),
    );
  };

  static styles = [buttonBaseStyles, reviewExportDialogStyles];
}

if (!customElements.get(REVIEW_EXPORT_DIALOG_TAG)) {
  customElements.define(REVIEW_EXPORT_DIALOG_TAG, ReviewExportDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    [REVIEW_EXPORT_DIALOG_TAG]: ReviewExportDialog;
  }
}
