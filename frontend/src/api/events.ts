import type { HomeAssistantApi } from "../core/home-assistant";
import type {
  RecordedMediaSource,
  RecordedMediaTransport,
} from "../core/recorded-media";

export interface EventItem {
  readonly camera: string;
  readonly clip_url: string | null;
  readonly end_time: number | null;
  readonly has_clip: boolean;
  readonly has_snapshot: boolean;
  readonly id: string;
  readonly label: string;
  readonly playback_sources: readonly RecordedMediaSource[];
  readonly preferred_transport: RecordedMediaTransport;
  readonly revision: string;
  readonly snapshot_url: string | null;
  readonly start_time: number;
  readonly sub_label: string | null;
  readonly thumbnail_url: string | null;
  readonly zones: readonly string[];
}

interface EventsResponse {
  readonly items: readonly EventItem[];
}

export async function listEvents(
  api: HomeAssistantApi,
  entityId: string,
  options: { readonly bypassCache?: boolean; readonly historyDays: number },
): Promise<readonly EventItem[]> {
  const before = Date.now() / 1000;
  const response = await api.callWS<EventsResponse>({
    type: "watchzone/events/list",
    entity_id: entityId,
    after: before - options.historyDays * 24 * 60 * 60,
    before,
    limit: 500,
    bypass_cache: options.bypassCache ?? false,
  });
  return response.items;
}
