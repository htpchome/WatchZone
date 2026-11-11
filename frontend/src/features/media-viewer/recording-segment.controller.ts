import {
  resolveRecordingSegment,
  type RecordingSegmentMedia,
} from "../../api/recordings";
import type { HomeAssistantApi } from "../../core/home-assistant";
import type { RecordingTimeline } from "../../core/recorded-media";

export interface RecordingSegmentSelection {
  readonly endTime: number;
  readonly startTime: number;
}

/** Owns segment-selection state, preview bounds, and download orchestration. */
export class RecordingSegmentController {
  public active = false;
  public downloading = false;
  public selection?: RecordingSegmentSelection;

  private _timelineIdentity = "";

  public constructor(
    private readonly _api: () => HomeAssistantApi | undefined,
    private readonly _requestUpdate: () => void,
    private readonly _onError: (operation: "download" | "preview") => void,
  ) {}

  public configure(timeline: RecordingTimeline | undefined): void {
    const identity = timeline
      ? `${timeline.entityId}:${timeline.startTime}:${timeline.endTime}`
      : "";
    if (identity === this._timelineIdentity) return;
    this._timelineIdentity = identity;
    this.active = false;
    this.downloading = false;
    this.selection = timeline ? fullSelection(timeline) : undefined;
  }

  public activate(timeline: RecordingTimeline): void {
    this.active = true;
    this.selection = fullSelection(timeline);
    this._requestUpdate();
  }

  public cancel(): void {
    this.active = false;
    this._requestUpdate();
  }

  public reset(timeline: RecordingTimeline): void {
    this.selection = fullSelection(timeline);
    this._requestUpdate();
  }

  public setStart(timestamp: number, timeline: RecordingTimeline): void {
    const endTime = this.selection?.endTime ?? timeline.endTime;
    const candidate = clamp(
      Math.round(timestamp),
      selectableStart(timeline),
      endTime - 1,
    );
    this.selection = {
      startTime: snapToAvailableStart(candidate, timeline, endTime),
      endTime,
    };
    this._requestUpdate();
  }

  public setEnd(timestamp: number, timeline: RecordingTimeline): void {
    const startTime = this.selection?.startTime ?? timeline.startTime;
    const candidate = clamp(
      Math.round(timestamp),
      startTime + 1,
      selectableEnd(timeline),
    );
    this.selection = {
      startTime,
      endTime: snapToAvailableEnd(candidate, timeline, startTime),
    };
    this._requestUpdate();
  }

  public beginPreview(): RecordingSegmentSelection | undefined {
    return this.selection;
  }

  public async resolvePreview(
    timeline: RecordingTimeline,
  ): Promise<RecordingSegmentMedia | undefined> {
    const api = this._api();
    const selection = this.selection;
    if (!api || !selection || this.downloading) return undefined;
    try {
      return await resolveRecordingSegment(
        api,
        timeline.entityId,
        selection.startTime,
        selection.endTime,
      );
    } catch {
      this._onError("preview");
      return undefined;
    }
  }

  public async download(timeline: RecordingTimeline): Promise<void> {
    const api = this._api();
    const selection = this.selection;
    if (!api || !selection || this.downloading) return;
    this.downloading = true;
    this._requestUpdate();
    try {
      const download = await resolveRecordingSegment(
        api,
        timeline.entityId,
        selection.startTime,
        selection.endTime,
      );
      const signed = await api.callWS<{ readonly path?: string }>({
        type: "auth/sign_path",
        path: download.path,
        expires: 3600,
      });
      const anchor = document.createElement("a");
      anchor.dataset.recordedMediaOpener = "true";
      anchor.href = api.resolveUrl(signed.path ?? download.path);
      anchor.download = download.filename;
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
      }
    } catch {
      this._onError("download");
    } finally {
      this.downloading = false;
      this._requestUpdate();
    }
  }
}

function fullSelection(timeline: RecordingTimeline): RecordingSegmentSelection {
  return { startTime: timeline.startTime, endTime: timeline.endTime };
}

export function selectableStart(timeline: RecordingTimeline): number {
  return Math.min(timeline.startTime, timeline.selectionStartTime);
}

export function selectableEnd(timeline: RecordingTimeline): number {
  return Math.max(timeline.endTime, timeline.selectionEndTime);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function snapToAvailableStart(
  timestamp: number,
  timeline: RecordingTimeline,
  endTime: number,
): number {
  const available = timeline.selectionSpans.filter(
    (span) => span.endTime - span.startTime >= 1 && span.startTime < endTime,
  );
  for (const span of available) {
    if (timestamp >= span.startTime && timestamp < span.endTime) {
      return timestamp;
    }
    if (timestamp < span.startTime && span.startTime < endTime) {
      return span.startTime;
    }
  }
  const last = available.at(-1);
  return last
    ? clamp(last.endTime - 1, last.startTime, endTime - 1)
    : Math.max(selectableStart(timeline), endTime - 1);
}

function snapToAvailableEnd(
  timestamp: number,
  timeline: RecordingTimeline,
  startTime: number,
): number {
  const available = timeline.selectionSpans.filter(
    (span) => span.endTime - span.startTime >= 1 && span.endTime > startTime,
  );
  for (const span of [...available].reverse()) {
    if (timestamp > span.startTime && timestamp <= span.endTime) {
      return timestamp;
    }
    if (timestamp > span.endTime && span.endTime > startTime) {
      return span.endTime;
    }
  }
  const first = available[0];
  return first
    ? clamp(first.startTime + 1, startTime + 1, first.endTime)
    : Math.min(selectableEnd(timeline), startTime + 1);
}
