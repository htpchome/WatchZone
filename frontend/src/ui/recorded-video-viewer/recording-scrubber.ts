import { html, LitElement, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";

import {
  RECORDING_SCRUBBER_EVENT,
  RECORDING_SCRUBBER_TAG,
} from "../../core/constants";
import {
  homeAssistantDateTimeFormat,
  homeAssistantHour12,
} from "../../core/date-time";
import type {
  HomeAssistantApi,
  HomeAssistantLocale,
} from "../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import type {
  RecordingTimeline,
  RecordingTimelineMarker,
} from "../../core/recorded-media";
import { releaseTouchFocus } from "../control-interaction";
import { renderIcon } from "../icons";
import { recordingScrubberStyles } from "./recording-scrubber.styles";

export interface RecordingScrubberEventDetail {
  readonly action: "seek" | "seek_and_play" | "toggle_play";
  readonly timestamp?: number;
}

const TICK_COUNT = 6;

/** Wall-clock recording timeline with availability and activity markers. */
export class RecordingScrubber extends LitElement {
  public static properties = {
    api: { attribute: false },
    currentTimestamp: { attribute: false, type: Number },
    localize: { attribute: false },
    paused: { attribute: false, type: Boolean },
    timeline: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public currentTimestamp = 0;
  public localize: LocalizeFunction = englishLocalize;
  public paused = true;
  public timeline?: RecordingTimeline;

  private _preview?: RecordingTimelineMarker;

  protected render() {
    const timeline = this.timeline;
    if (!timeline) return nothing;
    const current = clamp(
      this.currentTimestamp || timeline.startTime,
      timeline.startTime,
      timeline.endTime,
    );
    const pointer = percentage(current, timeline);
    const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, index) => {
      const timestamp =
        timeline.startTime +
        ((timeline.endTime - timeline.startTime) * index) / TICK_COUNT;
      return { index, timestamp };
    });
    return html`<div class="scrubber">
      <button
        class="playback"
        type="button"
        data-control="toggle_play"
        title=${this.localize(
          this.paused ? "media_player.play" : "media_player.pause",
        )}
        aria-label=${this.localize(
          this.paused ? "media_player.play" : "media_player.pause",
        )}
        @pointerup=${releaseTouchFocus}
        @click=${this._togglePlayback}
      >
        ${renderIcon(this.paused ? "play" : "pause")}
      </button>
      <div class="timeline">
        <div class="track">
          ${timeline.spans.map(
            (span, index) =>
              html`<span
                class=${`span ${index === 0 ? "first" : ""} ${
                  index === timeline.spans.length - 1 ? "last" : ""
                }`}
                style=${positionStyle(span.startTime, span.endTime, timeline)}
              ></span>`,
          )}
          ${ticks.map(
            ({ index }) =>
              html`<span
                class="tick"
                style=${`inset-inline-start: ${(index / TICK_COUNT) * 100}%`}
              ></span>`,
          )}
          ${repeat(
            timeline.markers,
            ({ id }) => id,
            (marker) => this._renderMarker(marker, timeline),
          )}
          <input
            class="range"
            type="range"
            min=${String(timeline.startTime)}
            max=${String(timeline.endTime)}
            step="1"
            .value=${String(current)}
            aria-label=${this.localize("media_player.seek")}
            aria-valuetext=${formatTimelineTime(current, this.api?.locale)}
            @input=${this._seek}
          />
          <span
            class="pointer"
            style=${`inset-inline-start: ${pointer}%`}
            aria-hidden="true"
          >
            <span class="pointer-time"
              >${formatTimelineTime(current, this.api?.locale)}</span
            >
          </span>
          ${this._renderPreview(timeline)}
        </div>
        <div class="labels" aria-hidden="true">
          ${ticks.map(
            ({ index, timestamp }) =>
              html`<span
                class="label"
                style=${`inset-inline-start: ${(index / TICK_COUNT) * 100}%`}
                >${formatTimelineTime(timestamp, this.api?.locale)}</span
              >`,
          )}
        </div>
      </div>
    </div>`;
  }

  private _renderMarker(
    marker: RecordingTimelineMarker,
    timeline: RecordingTimeline,
  ) {
    const classification = this.localize(`reviews.${marker.classification}`);
    const time = formatTimelineTime(marker.startTime, this.api?.locale);
    const label = `${classification} - ${time}`;
    return html`<button
      class=${`marker ${marker.classification}`}
      type="button"
      style=${positionStyle(marker.startTime, marker.endTime, timeline)}
      title=${label}
      aria-label=${label}
      @pointerenter=${() => this._showPreview(marker)}
      @pointerleave=${() => this._hidePreview(marker)}
      @focus=${() => this._showPreview(marker)}
      @blur=${() => this._hidePreview(marker)}
      @click=${(event: MouseEvent) => this._seekMarker(event, marker)}
    ></button>`;
  }

  private _renderPreview(timeline: RecordingTimeline) {
    const marker = this._preview;
    if (!marker) return nothing;
    const center = percentage(
      (marker.startTime + marker.endTime) / 2,
      timeline,
    );
    const clampedCenter = clamp(center, 16, 84);
    const classification = this.localize(`reviews.${marker.classification}`);
    const label = `${classification} - ${formatTimelineTime(
      marker.startTime,
      this.api?.locale,
    )}`;
    return html`<div
      class="preview"
      style=${`inset-inline-start: ${clampedCenter}%`}
      role="status"
    >
      <img
        src=${this.api?.resolveUrl(marker.thumbnailUrl) ?? marker.thumbnailUrl}
        alt=""
      />
      <span class="preview-label">${label}</span>
    </div>`;
  }

  private readonly _togglePlayback = (): void => {
    this._dispatch({ action: "toggle_play" });
  };

  private readonly _seek = (event: Event): void => {
    this._dispatch({
      action: "seek",
      timestamp: Number((event.currentTarget as HTMLInputElement).value),
    });
  };

  private _seekMarker(
    event: MouseEvent,
    marker: RecordingTimelineMarker,
  ): void {
    event.stopPropagation();
    this._dispatch({ action: "seek_and_play", timestamp: marker.startTime });
  }

  private _showPreview(marker: RecordingTimelineMarker): void {
    if (this._preview === marker) return;
    this._preview = marker;
    this.requestUpdate();
  }

  private _hidePreview(marker: RecordingTimelineMarker): void {
    if (this._preview !== marker) return;
    this._preview = undefined;
    this.requestUpdate();
  }

  private _dispatch(detail: RecordingScrubberEventDetail): void {
    this.dispatchEvent(
      new CustomEvent<RecordingScrubberEventDetail>(RECORDING_SCRUBBER_EVENT, {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
  }

  static styles = recordingScrubberStyles;
}

function positionStyle(
  startTime: number,
  endTime: number,
  timeline: RecordingTimeline,
): string {
  const start = percentage(startTime, timeline);
  const end = percentage(endTime, timeline);
  return `inset-inline-start: ${start}%; inline-size: max(0.48rem, ${Math.max(
    0,
    end - start,
  )}%)`;
}

function percentage(timestamp: number, timeline: RecordingTimeline): number {
  const duration = timeline.endTime - timeline.startTime;
  if (duration <= 0) return 0;
  return clamp(((timestamp - timeline.startTime) / duration) * 100, 0, 100);
}

function formatTimelineTime(
  timestamp: number,
  locale?: HomeAssistantLocale,
): string {
  const language =
    locale?.time_format === "system" ? undefined : locale?.language;
  return homeAssistantDateTimeFormat(
    locale,
    {
      hour: "numeric",
      hour12: homeAssistantHour12(locale),
      minute: "2-digit",
    },
    language,
  )
    .formatToParts(new Date(timestamp * 1000))
    .filter(({ type }) => type !== "dayPeriod")
    .map(({ value }) => value)
    .join("")
    .trim();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

if (!customElements.get(RECORDING_SCRUBBER_TAG)) {
  customElements.define(RECORDING_SCRUBBER_TAG, RecordingScrubber);
}

declare global {
  interface HTMLElementTagNameMap {
    [RECORDING_SCRUBBER_TAG]: RecordingScrubber;
  }
}
