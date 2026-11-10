import { html, LitElement } from "lit";
import { repeat } from "lit/directives/repeat.js";

import type { RecordingHour } from "../../../api/recordings";
import {
  formatHomeAssistantDateKey,
  formatHomeAssistantEventDate,
  formatHomeAssistantTime,
  homeAssistantDateKey,
  homeAssistantDateTimeFormat,
} from "../../../core/date-time";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import { openRecordedMedia } from "../../../core/recorded-media";
import { RECORDINGS_TAG } from "../../../core/constants";
import { homeAssistantNumberFormat } from "../../../core/number-format";
import { renderIcon } from "../../../ui/icons";
import "../../../ui/media-day-header";
import { ToastManager } from "../../../ui/toast-manager";
import "../../../ui/toast-region";
import type { CameraSelectionContext } from "../../camera-selection-context";
import type { MediaDateContext } from "../../media-date-context";
import { RecordingsController } from "./recordings.controller";
import { recordingsStyles } from "./recordings.styles";

/** Active-camera recordings grouped into provider-normalized hourly ranges. */
export class RecordingsModule extends LitElement {
  public static properties = {
    api: { attribute: false },
    cameraSelection: { attribute: false },
    localize: { attribute: false },
    mediaDate: { attribute: false },
    targetModuleId: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public cameraSelection?: CameraSelectionContext;
  public localize: LocalizeFunction = englishLocalize;
  public mediaDate?: MediaDateContext;
  public targetModuleId = "";

  private readonly _toasts = new ToastManager(this);
  private readonly _recordings = new RecordingsController(
    this,
    () => ({
      api: this.api,
      cameraSelection: this.cameraSelection,
      mediaDate: this.mediaDate,
      targetModuleId: this.targetModuleId,
    }),
    () =>
      this._toasts.error(this.localize("recordings.load_failed"), {
        key: "recordings-load-failed",
      }),
  );

  protected render() {
    const hours = this._recordings.hours;
    const previousDate = this._recordings.adjacentDate(-1);
    const nextDate = this._recordings.adjacentDate(1);
    return html`
      <div class="viewport">
        <wzc-media-day-header .label=${this._dayLabel(hours)}
          >${this._renderDayNavigation("previous", previousDate)}
          ${this._renderDayNavigation("next", nextDate)}</wzc-media-day-header
        >
        <div class="scroller">
          ${
            this._recordings.loading && hours.length === 0
              ? html`<div
                  class="list"
                  aria-busy="true"
                  aria-label=${this.localize("recordings.loading")}
                >
                  ${this._skeletonHours().map((hour) =>
                    this._renderSkeletonHour(hour),
                  )}
                </div>`
              : hours.length === 0
                ? html`<div class="empty">
                    ${this.localize("recordings.empty")}
                  </div>`
                : html`<div
                    class="list"
                    aria-label=${this.localize("recordings.list")}
                  >
                    ${repeat(
                      hours,
                      ({ id }) => id,
                      (hour) => this._renderHour(hour),
                    )}
                  </div>`
          }
        </div>
      </div>
      <wzc-toast-region .notices=${this._toasts.notices}></wzc-toast-region>
    `;
  }

  private _renderDayNavigation(
    direction: "previous" | "next",
    date: string | undefined,
  ) {
    if (!date) return null;
    const label = this.localize(`recordings.${direction}_day`, {
      date: formatHomeAssistantDateKey(date, this.api?.locale),
    });
    return html`<button
      slot=${direction}
      class="day-navigation"
      type="button"
      title=${label}
      aria-label=${label}
      @click=${() => this._recordings.selectDate(date)}
    >
      <ha-icon
        icon=${`mdi:arrow-${direction === "previous" ? "left" : "right"}`}
      ></ha-icon>
    </button>`;
  }

  private _renderHour(hour: RecordingHour) {
    const title = this._title(hour);
    return html`<article class="tile">
      <button
        class="tile-player"
        data-recorded-media-opener="true"
        type="button"
        title=${this.localize("recordings.open", { title })}
        aria-label=${this.localize("recordings.open", { title })}
        @click=${() => this._open(hour, title)}
      ></button>
      <span class="movie">${renderIcon("movie")}</span>
      <span class="details">
        <span class="range">${this._range(hour)}</span>
        <span class="duration">${this._duration(hour.duration)}</span>
      </span>
      <button
        class="download"
        type="button"
        title=${this.localize("recordings.download")}
        aria-label=${this.localize("recordings.download")}
        @click=${(event: MouseEvent) => this._download(event, hour)}
      >
        <ha-icon icon="mdi:download"></ha-icon>
      </button>
    </article>`;
  }

  private _renderSkeletonHour(hour: number) {
    return html`<article class="tile skeleton" aria-hidden="true">
      <span class="movie">${renderIcon("movie")}</span>
      <span class="details">
        <span class="range">${this._skeletonRange(hour)}</span>
        <span class="duration">—</span>
      </span>
      <button class="download" type="button" disabled tabindex="-1">
        <ha-icon icon="mdi:download"></ha-icon>
      </button>
    </article>`;
  }

  private _skeletonHours(): readonly number[] {
    const today = homeAssistantDateKey(Date.now() / 1000, this.api?.locale);
    const selectedDate = this._recordings.selectedDate() ?? today;
    const latestHour =
      selectedDate === today
        ? Number(
            homeAssistantDateTimeFormat(this.api?.locale, {
              hour: "numeric",
              hourCycle: "h23",
            })
              .formatToParts(new Date(Date.now()))
              .find(({ type }) => type === "hour")?.value ?? 0,
          )
        : 23;
    return Array.from({ length: latestHour + 1 }, (_, index) => {
      return latestHour - index;
    });
  }

  private _skeletonRange(hour: number): string {
    const skeletonLocale = {
      ...this.api?.locale,
      language: this.api?.locale?.language ?? "en",
      time_zone: "UTC",
    };
    return `${formatHomeAssistantTime(
      new Date(Date.UTC(2020, 0, 1, hour)),
      skeletonLocale,
    )} – ${formatHomeAssistantTime(
      new Date(Date.UTC(2020, 0, 1, hour + 1)),
      skeletonLocale,
    )}`;
  }

  private async _download(
    event: MouseEvent,
    hour: RecordingHour,
  ): Promise<void> {
    event.stopPropagation();
    const api = this.api;
    if (!api) return;
    const separator = hour.download_url.includes("?") ? "&" : "?";
    const path = `${hour.download_url}${separator}download=true`;
    try {
      const signed = await api.callWS<{ readonly path?: string }>({
        type: "auth/sign_path",
        path,
        expires: 3600,
      });
      const anchor = document.createElement("a");
      anchor.href = api.resolveUrl(signed.path ?? path);
      anchor.download = `${hour.camera}-${Math.floor(hour.start_time)}.mp4`;
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
      }
    } catch {
      this._toasts.error(this.localize("recordings.download_failed"), {
        key: "recordings-download-failed",
      });
    }
  }

  private _open(hour: RecordingHour, title: string): void {
    openRecordedMedia(this, {
      id: hour.id,
      kind: "video",
      preferredTransport: hour.preferred_transport,
      sources: hour.playback_sources,
      title,
      timeline: {
        endTime: hour.timeline_end_time,
        markers: hour.markers.map((marker) => ({
          classification: marker.classification,
          endTime: marker.end_time,
          id: marker.id,
          startTime: marker.start_time,
          thumbnailUrl: marker.thumbnail_url,
        })),
        spans: hour.spans.map((span) => ({
          endTime: span.end_time,
          mediaOffset: span.media_offset,
          startTime: span.start_time,
        })),
        startTime: hour.timeline_start_time,
      },
    });
  }

  private _title(hour: RecordingHour): string {
    const camera = this._recordings.activeCameraLabel ?? hour.camera;
    return `${camera} - ${this._range(hour)} - ${formatHomeAssistantEventDate(
      new Date(hour.start_time * 1000),
      this.api?.locale,
    )}`;
  }

  private _dayLabel(hours: readonly RecordingHour[]): string {
    const selectedDate = this._recordings.selectedDate();
    let date: Date;
    const locale = this.api?.locale;
    if (hours[0]) {
      date = new Date(hours[0].start_time * 1000);
    } else if (selectedDate) {
      return `${formatHomeAssistantDateKey(selectedDate, locale)} — ${this.localize(
        "navigation.recordings",
      )}`;
    } else {
      date = new Date();
    }
    return `${formatHomeAssistantEventDate(date, locale)} — ${this.localize(
      "navigation.recordings",
    )}`;
  }

  private _range(hour: RecordingHour): string {
    return `${formatHomeAssistantTime(
      new Date(hour.start_time * 1000),
      this.api?.locale,
    )} – ${formatHomeAssistantTime(
      new Date(hour.end_time * 1000),
      this.api?.locale,
    )}`;
  }

  private _duration(seconds: number): string {
    const whole = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(whole / 60);
    const remainder = whole % 60;
    const format = homeAssistantNumberFormat(this.api?.locale, {
      maximumFractionDigits: 0,
    });
    return this.localize("recordings.duration", {
      minutes: format.format(minutes),
      seconds: format.format(remainder),
    });
  }

  static styles = recordingsStyles;
}

if (!customElements.get(RECORDINGS_TAG)) {
  customElements.define(RECORDINGS_TAG, RecordingsModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [RECORDINGS_TAG]: RecordingsModule;
  }
}
