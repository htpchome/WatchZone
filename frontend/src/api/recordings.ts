import type { HomeAssistantApi } from "../core/home-assistant";
import type {
  RecordedMediaSource,
  RecordedMediaTransport,
} from "../core/recorded-media";

export interface RecordingHour {
  readonly camera: string;
  readonly download_url: string;
  readonly duration: number;
  readonly end_time: number;
  readonly id: string;
  readonly playback_sources: readonly RecordedMediaSource[];
  readonly preferred_transport: RecordedMediaTransport;
  readonly revision: string;
  readonly start_time: number;
}

export interface RecordingWindow {
  readonly days: readonly string[];
  readonly hours: readonly RecordingHour[];
}

export interface RecordingWindowOptions {
  readonly after: number;
  readonly before: number;
  readonly selectedDate: string;
  readonly timezone: string;
}

export async function listRecordings(
  api: HomeAssistantApi,
  entityId: string,
  options: RecordingWindowOptions,
): Promise<RecordingWindow> {
  return api.callWS<RecordingWindow>({
    type: "watchzone/recordings/list",
    entity_id: entityId,
    after: options.after,
    before: options.before,
    selected_date: options.selectedDate,
    timezone: options.timezone,
  });
}
