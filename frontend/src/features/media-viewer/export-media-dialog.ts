import { EXPORT_MEDIA_DIALOG_TAG } from "../../core/constants";
import { DraggableRecordedMediaDialog } from "./draggable";

/** Export-owned recorded-media modal composition. */
export class ExportMediaDialog extends DraggableRecordedMediaDialog {}

if (!customElements.get(EXPORT_MEDIA_DIALOG_TAG)) {
  customElements.define(EXPORT_MEDIA_DIALOG_TAG, ExportMediaDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    [EXPORT_MEDIA_DIALOG_TAG]: ExportMediaDialog;
  }
}
