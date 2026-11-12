import { RECORDED_MEDIA_OPEN_EVENT } from "./constants";

export type RecordedMediaTransport = "file" | "hls";

export interface RecordedMediaSource {
  readonly content_type: string;
  readonly transport: RecordedMediaTransport;
  readonly url: string;
}

export interface RecordedMediaRequest {
  readonly id: string;
  readonly kind: "snapshot" | "video";
  readonly presentation: "event" | "export" | "recording" | "review";
  readonly posterUrl?: string;
  readonly preferredTransport: RecordedMediaTransport;
  readonly sources: readonly RecordedMediaSource[];
  readonly title: string;
  readonly timeline?: RecordingTimeline;
}

export interface RecordingTimelineSpan {
  readonly endTime: number;
  readonly mediaOffset: number;
  readonly startTime: number;
}

export interface RecordingTimelineAvailabilitySpan {
  readonly endTime: number;
  readonly startTime: number;
}

export interface RecordingTimelineMarker {
  readonly classification: "alert" | "detection";
  readonly endTime: number;
  readonly id: string;
  readonly startTime: number;
  readonly thumbnailUrl: string;
}

export interface RecordingTimeline {
  readonly availableEndTime: number;
  readonly availableStartTime: number;
  readonly camera: string;
  readonly endTime: number;
  readonly entityId: string;
  readonly markers: readonly RecordingTimelineMarker[];
  readonly selectionEndTime: number;
  readonly selectionSpans: readonly RecordingTimelineAvailabilitySpan[];
  readonly selectionStartTime: number;
  readonly spans: readonly RecordingTimelineSpan[];
  readonly startTime: number;
}

export interface RecordedMediaInitialGeometry {
  readonly height: number;
  readonly width: number;
}

export function openRecordedMedia(
  target: EventTarget,
  request: RecordedMediaRequest,
): void {
  target.dispatchEvent(
    new CustomEvent<RecordedMediaRequest>(RECORDED_MEDIA_OPEN_EVENT, {
      bubbles: true,
      composed: true,
      detail: request,
    }),
  );
}

declare global {
  interface HTMLElementEventMap {
    [RECORDED_MEDIA_OPEN_EVENT]: CustomEvent<RecordedMediaRequest>;
  }
}
