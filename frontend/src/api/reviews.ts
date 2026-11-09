import type { HomeAssistantApi } from "../core/home-assistant";
import type {
  RecordedMediaSource,
  RecordedMediaTransport,
} from "../core/recorded-media";

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
  readonly revision: string;
  readonly related_event_ids: readonly string[];
  readonly snapshot_url: string | null;
  readonly start_time: number;
  readonly sub_labels: readonly string[];
  readonly thumbnail_url: string | null;
  readonly zones: readonly string[];
}

interface ReviewsResponse {
  readonly items: readonly ReviewItem[];
}

export async function listReviews(
  api: HomeAssistantApi,
  entityId: string,
  options: { readonly bypassCache?: boolean; readonly historyDays: number },
): Promise<readonly ReviewItem[]> {
  const before = Date.now() / 1000;
  const response = await api.callWS<ReviewsResponse>({
    type: "watchzone/reviews/list",
    entity_id: entityId,
    after: before - options.historyDays * 24 * 60 * 60,
    before,
    limit: 500,
    bypass_cache: options.bypassCache ?? false,
  });
  return response.items;
}
