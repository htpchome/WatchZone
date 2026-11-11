import { RECORDING_MEDIA_DIALOG_TAG } from "../../core/constants";
import { DraggableRecordedMediaDialog } from "./draggable-dialog";

/** Recording-owned media modal composition. */
export class RecordingMediaDialog extends DraggableRecordedMediaDialog {
  protected renderMediaContent(): unknown {
    return this.renderDefaultMediaContent();
  }
}

if (!customElements.get(RECORDING_MEDIA_DIALOG_TAG)) {
  customElements.define(RECORDING_MEDIA_DIALOG_TAG, RecordingMediaDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    [RECORDING_MEDIA_DIALOG_TAG]: RecordingMediaDialog;
  }
}
