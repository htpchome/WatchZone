import { RECORDED_VIDEO_DIALOG_TAG } from "../../core/constants";
import type { RecordedMediaRequest } from "../../core/recorded-media";

interface MediaViewerPresentationDefinition {
  readonly load: () => Promise<unknown>;
  readonly tagName: string;
}

const loadDraggableDialog = (): Promise<unknown> =>
  import("./draggable-dialog");

const presentations: Readonly<
  Record<
    RecordedMediaRequest["presentation"],
    MediaViewerPresentationDefinition
  >
> = {
  event: {
    load: loadDraggableDialog,
    tagName: RECORDED_VIDEO_DIALOG_TAG,
  },
  recording: {
    load: loadDraggableDialog,
    tagName: RECORDED_VIDEO_DIALOG_TAG,
  },
  review: {
    load: loadDraggableDialog,
    tagName: RECORDED_VIDEO_DIALOG_TAG,
  },
};

/** Selects the concrete shell without coupling viewer lifecycle to geometry. */
export function mediaViewerPresentation(
  presentation: RecordedMediaRequest["presentation"],
): MediaViewerPresentationDefinition {
  return presentations[presentation];
}
