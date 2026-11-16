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
  readonly score: number | null;
  readonly snapshot_url: string | null;
  readonly start_time: number;
  readonly sub_label: string | null;
  readonly thumbnail_url: string | null;
  readonly zones: readonly string[];
}

export async function getEvent(
  api: HomeAssistantApi,
  entityId: string,
  eventId: string,
): Promise<EventItem | undefined> {
  const response = await api.callWS<{ readonly item: EventItem | null }>({
    type: "watchzone/events/get",
    entity_id: entityId,
    event_id: eventId,
  });
  return response.item ?? undefined;
}

export async function listEvents(
  api: HomeAssistantApi,
  entityId: string,
  options: ActivityWindowOptions,
): Promise<ActivityWindowPage<EventItem>> {
  return listActivityWindow<EventItem>(
    api,
    entityId,
    "watchzone/events/list",
    options,
  );
}
