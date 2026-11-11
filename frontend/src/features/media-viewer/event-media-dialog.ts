import { EVENT_MEDIA_DIALOG_TAG } from "../../core/constants";
import { DraggableRecordedMediaDialog } from "./draggable-dialog";

/** Event-owned recorded-media modal composition. */
export class EventMediaDialog extends DraggableRecordedMediaDialog {
  protected renderMediaContent(): unknown {
    return this.renderDefaultMediaContent();
  }
}

if (!customElements.get(EVENT_MEDIA_DIALOG_TAG)) {
  customElements.define(EVENT_MEDIA_DIALOG_TAG, EventMediaDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    [EVENT_MEDIA_DIALOG_TAG]: EventMediaDialog;
  }
}
