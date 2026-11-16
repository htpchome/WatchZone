import { REVIEW_EXPORT_DIALOG_TAG } from "../../../core/constants";
import {
  ExportNameDialog,
  type ExportNameConfirmation,
  type ExportNameDraft,
} from "../../../features/exports";

export type ReviewExportDraft = ExportNameDraft;
export type ReviewExportConfirmation = ExportNameConfirmation;

/** Review-specific identity over the shared export naming dialog. */
export class ReviewExportDialog extends ExportNameDialog {}

if (!customElements.get(REVIEW_EXPORT_DIALOG_TAG)) {
  customElements.define(REVIEW_EXPORT_DIALOG_TAG, ReviewExportDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    [REVIEW_EXPORT_DIALOG_TAG]: ReviewExportDialog;
  }
}
