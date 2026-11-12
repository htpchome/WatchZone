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
export type ReviewTrackingEventKind =
  "detected" | "entered_zone" | "became_active" | "became_stationary" | "left";

export interface ReviewTrackingEvent {
  readonly area: number | null;
  readonly area_percentage: number | null;
  readonly kind: ReviewTrackingEventKind;
  readonly ratio: number | null;
  readonly score: number | null;
  readonly timestamp: number;
  readonly zones: readonly string[];
}

export interface ReviewTrackedObject {
  readonly end_time: number | null;
  readonly events: readonly ReviewTrackingEvent[];
  readonly id: string;
  readonly label: string;
  readonly start_time: number;
  readonly sub_label: string | null;
}

export interface ReviewTrackingDetails {
  readonly objects: readonly ReviewTrackedObject[];
  readonly review_id: string;
}

export interface ReviewItem {
  readonly analysis_description: string | null;
  readonly analysis_concerns: readonly string[];
  readonly analysis_score: number | null;
  readonly analysis_title: string | null;
  readonly camera: string;
  readonly classification: ReviewClassification;
  readonly clip_url: string | null;
  readonly download_url?: string | null;
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
  readonly reviewed: boolean;
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

export async function setReviewReviewed(
  api: HomeAssistantApi,
  entityId: string,
  reviewId: string,
  reviewed: boolean,
): Promise<void> {
  await api.callWS({
    type: "watchzone/reviews/set_reviewed",
    entity_id: entityId,
    review_id: reviewId,
    reviewed,
  });
}

export async function getReviewTrackingDetails(
  api: HomeAssistantApi,
  entityId: string,
  reviewId: string,
): Promise<ReviewTrackingDetails> {
  return api.callWS<ReviewTrackingDetails>({
    type: "watchzone/reviews/tracking_details",
    entity_id: entityId,
    review_id: reviewId,
  });
}
