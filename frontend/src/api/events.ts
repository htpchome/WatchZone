import type { HomeAssistantApi } from "../core/home-assistant";
import type {
  RecordedMediaSource,
  RecordedMediaTransport,
} from "../core/recorded-media";
import { listActivityWindow } from "./activity-window";

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

export async function listEvents(
  api: HomeAssistantApi,
  entityId: string,
  options: { readonly bypassCache?: boolean; readonly historyDays: number },
): Promise<readonly EventItem[]> {
  return listActivityWindow<EventItem>(
    api,
    entityId,
    "watchzone/events/list",
    options,
  );
}
