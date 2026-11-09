import type { HomeAssistantApi } from "../core/home-assistant";
import type {
  RecordedMediaSource,
  RecordedMediaTransport,
} from "../core/recorded-media";
import {
  listActivityWindow,
  type ActivityWindowOptions,
} from "./activity-window";

export type ReviewClassification = "alert" | "detection";

export interface ReviewItem {
  readonly camera: string;
  readonly classification: ReviewClassification;
  readonly clip_url: string | null;
  readonly end_time: number | null;
  readonly id: string;
  readonly playback_sources: readonly RecordedMediaSource[];
  readonly preferred_transport: RecordedMediaTransport;
  readonly labels: readonly string[];
  readonly media_end_time: number;
  readonly media_start_time: number;
  readonly preview_url: string | null;
  readonly revision: string;
  readonly related_event_ids: readonly string[];
  readonly snapshot_url: string | null;
  readonly start_time: number;
  readonly sub_labels: readonly string[];
  readonly thumbnail_url: string | null;
  readonly zones: readonly string[];
}

export async function listReviews(
  api: HomeAssistantApi,
  entityId: string,
  options: ActivityWindowOptions<ReviewItem>,
): Promise<readonly ReviewItem[]> {
  return listActivityWindow<ReviewItem>(
    api,
    entityId,
    "watchzone/reviews/list",
    options,
  );
}
