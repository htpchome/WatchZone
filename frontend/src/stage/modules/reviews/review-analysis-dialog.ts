import { html, LitElement, nothing } from "lit";

import {
  REVIEW_ANALYSIS_CLOSE_EVENT,
  REVIEW_ANALYSIS_DIALOG_TAG,
} from "../../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import { reviewAnalysisDialogStyles } from "./review-analysis-dialog.styles";

export interface ReviewAnalysis {
  readonly description: string;
  readonly title: string;
}

/** Reviews-only presentation for provider-normalized generated analysis. */
export class ReviewAnalysisDialog extends LitElement {
  public static properties = {
    analysis: { attribute: false },
    localize: { attribute: false },
  };

  public analysis?: ReviewAnalysis;
  public localize: LocalizeFunction = englishLocalize;

  protected render() {
    const analysis = this.analysis;
    return html`<dialog
      aria-labelledby="analysis-heading"
      @cancel=${this._close}
      @click=${this._backdropClick}
    >
      ${
        analysis
          ? html`<header>
                <button
                  class="close"
                  type="button"
                  title=${this.localize("reviews.close_ai_analysis")}
                  aria-label=${this.localize("reviews.close_ai_analysis")}
                  @click=${this._close}
                >
                  <ha-icon icon="mdi:close"></ha-icon>
                </button>
                <h2 id="analysis-heading">
                  ${this.localize("reviews.ai_analysis")}
                </h2>
              </header>
              <section>
                <div class="field">
                  <h3>${this.localize("reviews.ai_title")}</h3>
                  <p>${analysis.title}</p>
                </div>
                <div class="field">
                  <h3>${this.localize("reviews.ai_description")}</h3>
                  <p>${analysis.description}</p>
                </div>
              </section>`
          : nothing
      }
    </dialog>`;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (!changed.has("analysis")) return;
    const dialog = this.renderRoot.querySelector("dialog");
    if (!dialog) return;
    if (this.analysis && !dialog.open) dialog.showModal();
    else if (!this.analysis && dialog.open) dialog.close();
  }

  private readonly _backdropClick = (event: MouseEvent): void => {
    if (event.target === event.currentTarget) this._close(event);
  };

  private readonly _close = (event: Event): void => {
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent(REVIEW_ANALYSIS_CLOSE_EVENT, {
        bubbles: true,
        composed: true,
      }),
    );
  };

  static styles = reviewAnalysisDialogStyles;
}

if (!customElements.get(REVIEW_ANALYSIS_DIALOG_TAG)) {
  customElements.define(REVIEW_ANALYSIS_DIALOG_TAG, ReviewAnalysisDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    [REVIEW_ANALYSIS_DIALOG_TAG]: ReviewAnalysisDialog;
  }
}
