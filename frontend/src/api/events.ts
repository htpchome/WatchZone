import type { HomeAssistantApi } from "../core/home-assistant";

export interface EventItem {
  readonly camera: string;
  readonly clip_url: string | null;
  readonly end_time: number | null;
  readonly has_clip: boolean;
  readonly has_snapshot: boolean;
  readonly id: string;
  readonly label: string;
  readonly revision: string;
  readonly snapshot_url: string | null;
  readonly start_time: number;
  readonly sub_label: string | null;
  readonly thumbnail_url: string | null;
}

interface EventsResponse {
  readonly items: readonly EventItem[];
}

export async function listEvents(
  api: HomeAssistantApi,
  entityId: string,
  bypassCache = false,
): Promise<readonly EventItem[]> {
  const before = Date.now() / 1000;
  const response = await api.callWS<EventsResponse>({
    type: "watchzone/events/list",
    entity_id: entityId,
    after: before - 24 * 60 * 60,
    before,
    limit: 50,
    bypass_cache: bypassCache,
  });
  return response.items;
}
