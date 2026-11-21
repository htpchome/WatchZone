import type { HomeAssistantApi } from "../core/home-assistant";
import type {
  RecordedMediaSource,
  RecordedMediaTransport,
} from "../core/recorded-media";
import {
  listActivityWindow,
  type ActivityWindowOptions,
  type ActivityWindowPage,
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
  readonly score: number | null;
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

export interface RecentReviewState {
  readonly end_time: number | null;
  readonly id: string;
}

export interface ReviewIndexItem {
  readonly classification: ReviewClassification;
  readonly id: string;
  readonly labels: readonly string[];
  readonly related_event_ids: readonly string[];
  readonly reviewed: boolean;
  readonly start_time: number;
  readonly sub_labels: readonly string[];
  readonly zones: readonly string[];
}

export async function getReview(
  api: HomeAssistantApi,
  entityId: string,
  reviewId: string,
): Promise<ReviewItem | undefined> {
  const response = await api.callWS<{ readonly item: ReviewItem | null }>({
    type: "camera_optics/reviews/get",
    entity_id: entityId,
    review_id: reviewId,
  });
  return response.item ?? undefined;
}

export async function listReviews(
  api: HomeAssistantApi,
  entityId: string,
  options: ActivityWindowOptions,
): Promise<ActivityWindowPage<ReviewItem>> {
  return listActivityWindow<ReviewItem>(
    api,
    entityId,
    "camera_optics/reviews/list",
    options,
  );
}

/** Retrieve lightweight metadata for the complete configured review window. */
export async function listReviewIndex(
  api: HomeAssistantApi,
  entityId: string,
  historyDays: number,
): Promise<readonly ReviewIndexItem[]> {
  const windowBefore = Date.now() / 1000;
  const windowAfter = windowBefore - historyDays * 24 * 60 * 60;
  const items = new Map<string, ReviewIndexItem>();
  let before = windowBefore;
  const limit = 500;

  while (before > windowAfter) {
    const response = await api.callWS<{
      readonly items: readonly ReviewIndexItem[];
    }>({
      type: "camera_optics/reviews/list",
      entity_id: entityId,
      after: windowAfter,
      before,
      limit,
      bypass_cache: false,
      summary_only: true,
    });
    for (const item of response.items) items.set(item.id, item);
    if (response.items.length < limit) break;
    const nextBefore = Math.min(
      ...response.items.map(({ start_time }) => start_time),
    );
    if (!Number.isFinite(nextBefore) || nextBefore >= before) break;
    before = nextBefore;
  }

  return [...items.values()].sort(
    (left, right) =>
      right.start_time - left.start_time || left.id.localeCompare(right.id),
  );
}

/** Retrieve a small authoritative review window for push-state reconciliation. */
export async function listRecentReviewStates(
  api: HomeAssistantApi,
  entityId: string,
): Promise<readonly RecentReviewState[]> {
  const before = Date.now() / 1000;
  const response = await api.callWS<{
    readonly items: readonly RecentReviewState[];
  }>({
    type: "camera_optics/reviews/list",
    entity_id: entityId,
    after: before - 24 * 60 * 60,
    before,
    limit: 10,
    bypass_cache: true,
    summary_only: true,
  });
  return response.items;
}

export async function setReviewReviewed(
  api: HomeAssistantApi,
  entityId: string,
  reviewId: string,
  reviewed: boolean,
): Promise<void> {
  await api.callWS({
    type: "camera_optics/reviews/set_reviewed",
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
    type: "camera_optics/reviews/tracking_details",
    entity_id: entityId,
    review_id: reviewId,
  });
}
