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
  readonly markers: readonly RecordingMarker[];
  readonly playback_sources: readonly RecordedMediaSource[];
  readonly preferred_transport: RecordedMediaTransport;
  readonly revision: string;
  readonly spans: readonly RecordingSpan[];
  readonly start_time: number;
  readonly timeline_end_time: number;
  readonly timeline_start_time: number;
}

export interface RecordingSpan {
  readonly end_time: number;
  readonly media_offset: number;
  readonly start_time: number;
}

export interface RecordingMarker {
  readonly classification: "alert" | "detection";
  readonly end_time: number;
  readonly id: string;
  readonly start_time: number;
  readonly thumbnail_url: string;
}

export interface RecordingWindow {
  readonly days: readonly string[];
  readonly hours: readonly RecordingHour[];
}

export interface RecordingWindowOptions {
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
    selected_date: options.selectedDate,
    timezone: options.timezone,
  });
}
