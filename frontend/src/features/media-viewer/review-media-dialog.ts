import { REVIEW_MEDIA_DIALOG_TAG } from "../../core/constants";
import { DraggableRecordedMediaDialog } from "./draggable";

/** Review-owned recorded-media modal composition. */
export class ReviewMediaDialog extends DraggableRecordedMediaDialog {}

if (!customElements.get(REVIEW_MEDIA_DIALOG_TAG)) {
  customElements.define(REVIEW_MEDIA_DIALOG_TAG, ReviewMediaDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    [REVIEW_MEDIA_DIALOG_TAG]: ReviewMediaDialog;
  }
}
