import {
  EVENT_MEDIA_DIALOG_TAG,
  EXPORT_MEDIA_DIALOG_TAG,
  RECORDED_MEDIA_BOTTOM_DRAWER_TAG,
  RECORDING_MEDIA_DIALOG_TAG,
  REVIEW_MEDIA_DIALOG_TAG,
} from "../../core/constants";
import type { RecordedMediaPlayerType } from "../../core/config";
import type { RecordedMediaRequest } from "../../core/recorded-media";

interface MediaViewerPresentationDefinition {
  readonly load: () => Promise<unknown>;
  readonly tagName: string;
}

const presentations: Readonly<
  Record<
    RecordedMediaRequest["presentation"],
    MediaViewerPresentationDefinition
  >
> = {
  event: {
    load: () => import("./event-media-dialog"),
    tagName: EVENT_MEDIA_DIALOG_TAG,
  },
  export: {
    load: () => import("./export-media-dialog"),
    tagName: EXPORT_MEDIA_DIALOG_TAG,
  },
  recording: {
    load: () => import("./recording-media-dialog"),
    tagName: RECORDING_MEDIA_DIALOG_TAG,
  },
  review: {
    load: () => import("./review-media-dialog"),
    tagName: REVIEW_MEDIA_DIALOG_TAG,
  },
};

/** Selects the concrete shell without coupling viewer lifecycle to geometry. */
export function mediaViewerPresentation(
  presentation: RecordedMediaRequest["presentation"],
  playerType: RecordedMediaPlayerType = "draggable",
): MediaViewerPresentationDefinition {
  if (playerType === "bottom_drawer") {
    return {
      load: () => import("./bottom-drawer"),
      tagName: RECORDED_MEDIA_BOTTOM_DRAWER_TAG,
    };
  }
  return presentations[presentation];
}
