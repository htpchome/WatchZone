import { RECORDED_MEDIA_OPEN_EVENT } from "./constants";

export type RecordedMediaTransport = "file" | "hls";

export interface RecordedMediaSource {
  readonly content_type: string;
  readonly transport: RecordedMediaTransport;
  readonly url: string;
}

export interface RecordedMediaRequest {
  readonly id: string;
  readonly posterUrl?: string;
  readonly preferredTransport: RecordedMediaTransport;
  readonly sources: readonly RecordedMediaSource[];
  readonly title: string;
}

export interface RecordedMediaInitialSize {
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
