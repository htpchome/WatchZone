import { EXPORT_MEDIA_DIALOG_TAG } from "../../core/constants";
import { DraggableRecordedMediaDialog } from "./draggable-dialog";

/** Export-owned recorded-media modal composition. */
export class ExportMediaDialog extends DraggableRecordedMediaDialog {
  protected renderMediaContent(): unknown {
    return this.renderDefaultMediaContent();
  }
}

if (!customElements.get(EXPORT_MEDIA_DIALOG_TAG)) {
  customElements.define(EXPORT_MEDIA_DIALOG_TAG, ExportMediaDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    [EXPORT_MEDIA_DIALOG_TAG]: ExportMediaDialog;
  }
}
