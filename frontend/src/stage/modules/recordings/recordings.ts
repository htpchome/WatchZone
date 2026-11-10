import { html, LitElement } from "lit";
import { repeat } from "lit/directives/repeat.js";

import type { RecordingHour } from "../../../api/recordings";
import {
  formatHomeAssistantEventDate,
  formatHomeAssistantTime,
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
    historyDays: { attribute: false },
    localize: { attribute: false },
    mediaDate: { attribute: false },
    targetModuleId: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public cameraSelection?: CameraSelectionContext;
  public historyDays = 5;
  public localize: LocalizeFunction = englishLocalize;
  public mediaDate?: MediaDateContext;
  public targetModuleId = "";

  private readonly _toasts = new ToastManager(this);
  private readonly _recordings = new RecordingsController(
    this,
    () => ({
      api: this.api,
      cameraSelection: this.cameraSelection,
      historyDays: this.historyDays,
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
    return html`
      ${
        this._recordings.loading && hours.length === 0
          ? html`<div
              class="list"
              aria-label=${this.localize("recordings.loading")}
            >
              ${[0, 1, 2].map(
                () => html`<div class="skeleton" aria-hidden="true"></div>`,
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
      <wzc-toast-region .notices=${this._toasts.notices}></wzc-toast-region>
    `;
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
      <a
        class="download"
        href=${this.api?.resolveUrl(hour.download_url) ?? hour.download_url}
        download
        title=${this.localize("recordings.download")}
        aria-label=${this.localize("recordings.download")}
        ><ha-icon icon="mdi:download"></ha-icon
      ></a>
    </article>`;
  }

  private _open(hour: RecordingHour, title: string): void {
    openRecordedMedia(this, {
      id: hour.id,
      kind: "video",
      preferredTransport: hour.preferred_transport,
      sources: hour.playback_sources,
      title,
    });
  }

  private _title(hour: RecordingHour): string {
    const camera = this._recordings.activeCameraLabel ?? hour.camera;
    return `${camera} - ${this._range(hour)} - ${formatHomeAssistantEventDate(
      new Date(hour.start_time * 1000),
      this.api?.locale,
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
