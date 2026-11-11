import { html, LitElement } from "lit";

import {
  RECORDING_SEGMENT_MANAGER_EVENT,
  RECORDING_SEGMENT_MANAGER_TAG,
} from "../../core/constants";
import {
  homeAssistantDateTimeFormat,
  homeAssistantHour12,
} from "../../core/date-time";
import type { HomeAssistantLocale } from "../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { renderIcon } from "../../ui/icons";
import type { RecordingSegmentSelection } from "./recording-segment.controller";
import { recordingSegmentManagerStyles } from "./recording-segment-manager.styles";

export type RecordingSegmentManagerAction =
  "cancel" | "download" | "preview" | "reset";

export class RecordingSegmentManager extends LitElement {
  public static properties = {
    downloading: { attribute: false, type: Boolean },
    locale: { attribute: false },
    localize: { attribute: false },
    selection: { attribute: false },
  };

  public downloading = false;
  public locale?: HomeAssistantLocale;
  public localize: LocalizeFunction = englishLocalize;
  public selection?: RecordingSegmentSelection;

  protected render() {
    const selection = this.selection;
    if (!selection) return null;
    const duration = Math.max(
      1,
      Math.round(selection.endTime - selection.startTime),
    );
    return html`<section class="manager">
      <div class="copy">
        <h3>${this.localize("recording_segments.title")}</h3>
        <p>${this.localize("recording_segments.instructions")}</p>
        <div class="selection">
          ${formatTime(selection.startTime, this.locale)} –
          ${formatTime(selection.endTime, this.locale)}
          <span class="duration"
            >${this.localize("recording_segments.duration", {
              minutes: Math.floor(duration / 60),
              seconds: String(duration % 60).padStart(2, "0"),
            })}</span
          >
        </div>
      </div>
      <div class="actions">
        ${this._button("reset", "reset")}
        ${this._button("cancel", "close", "cancel")}
        ${this._button("preview", "play")}
        ${this._button("download", "download", "primary", this.downloading)}
      </div>
    </section>`;
  }

  private _button(
    action: RecordingSegmentManagerAction,
    icon: "close" | "download" | "play" | "reset",
    className = "",
    disabled = false,
  ) {
    const label = this.localize(
      action === "download" && disabled
        ? "recording_segments.downloading"
        : `recording_segments.${action}`,
    );
    return html`<button
      class=${className}
      type="button"
      ?disabled=${disabled}
      title=${label}
      aria-label=${label}
      @click=${() => this._dispatch(action)}
    >
      ${renderIcon(icon)}<span>${label}</span>
    </button>`;
  }

  private _dispatch(action: RecordingSegmentManagerAction): void {
    this.dispatchEvent(
      new CustomEvent<RecordingSegmentManagerAction>(
        RECORDING_SEGMENT_MANAGER_EVENT,
        { bubbles: true, composed: true, detail: action },
      ),
    );
  }

  static styles = recordingSegmentManagerStyles;
}

function formatTime(timestamp: number, locale?: HomeAssistantLocale): string {
  return homeAssistantDateTimeFormat(locale, {
    hour: "numeric",
    hour12: homeAssistantHour12(locale),
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp * 1000));
}

if (!customElements.get(RECORDING_SEGMENT_MANAGER_TAG)) {
  customElements.define(RECORDING_SEGMENT_MANAGER_TAG, RecordingSegmentManager);
}

declare global {
  interface HTMLElementTagNameMap {
    [RECORDING_SEGMENT_MANAGER_TAG]: RecordingSegmentManager;
  }
}
