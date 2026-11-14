import { RECORDED_MEDIA_OPEN_EVENT } from "./constants";

export type RecordedMediaTransport = "file" | "hls";

export interface RecordedMediaSource {
  readonly content_type: string;
  readonly transport: RecordedMediaTransport;
  readonly url: string;
}

export interface RecordedMediaDownload {
  readonly filename: string;
  readonly path: string;
}

export interface RecordedMediaMetadata {
  readonly camera: string;
  readonly classification?: "alert" | "detection";
  readonly duration?: number;
  readonly endTime?: number | null;
  readonly objects: readonly string[];
  readonly score?: number;
  readonly startTime: number;
  readonly zones: readonly string[];
}

export interface RecordedMediaVariant {
  readonly download?: RecordedMediaDownload;
  readonly id: string;
  readonly kind: "snapshot" | "video";
  readonly posterUrl?: string;
  readonly preferredTransport: RecordedMediaTransport;
  readonly sources: readonly RecordedMediaSource[];
}

export interface RecordedMediaActions {
  readonly exportReview?: () => void;
  readonly viewReview?: () => void;
  readonly variants?: Partial<
    Record<RecordedMediaVariant["kind"], RecordedMediaVariant>
  >;
}

export interface RecordedMediaRequest {
  readonly actions?: RecordedMediaActions;
  readonly id: string;
  readonly kind: "snapshot" | "video";
  readonly metadata?: RecordedMediaMetadata;
  readonly presentation: "event" | "export" | "recording" | "review";
  readonly posterUrl?: string;
  readonly preferredTransport: RecordedMediaTransport;
  readonly sources: readonly RecordedMediaSource[];
  readonly title: string;
  readonly timeline?: RecordingTimeline;
}

export function recordedMediaVariantRequest(
  request: RecordedMediaRequest,
  kind: RecordedMediaVariant["kind"],
): RecordedMediaRequest | undefined {
  const variant = request.actions?.variants?.[kind];
  if (!variant) return undefined;
  return {
    ...request,
    actions: request.actions,
    id: variant.id,
    kind: variant.kind,
    posterUrl: variant.posterUrl,
    preferredTransport: variant.preferredTransport,
    sources: variant.sources,
  };
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
