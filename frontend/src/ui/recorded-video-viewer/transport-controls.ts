import { html, LitElement } from "lit";

import {
  RECORDED_VIDEO_TRANSPORT_EVENT,
  RECORDED_VIDEO_TRANSPORT_HOLD_EVENT,
  RECORDED_VIDEO_TRANSPORT_TAG,
} from "../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { releaseTouchFocus } from "../control-interaction";
import { renderIcon } from "../icons";
import { recordedVideoTransportStyles } from "./transport-controls.styles";

export type RecordedVideoTransportAction =
  "seek" | "toggle_mute" | "toggle_play" | "volume";

export interface RecordedVideoTransportEventDetail {
  readonly action: RecordedVideoTransportAction;
  readonly value?: number;
}

export interface RecordedVideoTransportHoldDetail {
  readonly active: boolean;
}

/** Recorded-media transport surface driven by its owning video player. */
export class RecordedVideoTransport extends LitElement {
  public static properties = {
    currentTime: { attribute: false, type: Number },
    duration: { attribute: false, type: Number },
    localize: { attribute: false },
    muted: { attribute: false, type: Boolean },
    paused: { attribute: false, type: Boolean },
    viewportEdge: {
      attribute: "viewport-edge",
      reflect: true,
      type: Boolean,
    },
    visible: { reflect: true, type: Boolean },
    volume: { attribute: false, type: Number },
  };

  public currentTime = 0;
  public duration = 0;
  public localize: LocalizeFunction = englishLocalize;
  public muted = true;
  public paused = true;
  public viewportEdge = false;
  public visible = false;
  public volume = 1;

  protected render() {
    const duration = finiteMediaValue(this.duration);
    const currentTime = Math.min(finiteMediaValue(this.currentTime), duration);
    const timeLabel = `${formatMediaTime(currentTime)}/${formatMediaTime(duration)}`;
    const timelineProgress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const volumeProgress = Math.max(0, Math.min(1, this.volume)) * 100;
    return html`<div
      class="transport"
      role="toolbar"
      aria-label=${this.localize("media_player.controls")}
      @click=${stopPropagation}
      @keydown=${stopPropagation}
      @pointerdown=${this._beginPointerInteraction}
      @pointerup=${this._endPointerInteraction}
      @pointercancel=${this._endPointerInteraction}
    >
      <button
        class="transport-button"
        type="button"
        data-control="toggle_play"
        title=${this.localize(
          this.paused ? "media_player.play" : "media_player.pause",
        )}
        aria-label=${this.localize(
          this.paused ? "media_player.play" : "media_player.pause",
        )}
        @pointerup=${releaseTouchFocus}
        @click=${() => this._dispatch("toggle_play")}
      >
        ${renderIcon(this.paused ? "play" : "pause")}
      </button>
      <input
        class="timeline"
        type="range"
        min="0"
        max=${String(duration)}
        step="0.01"
        .value=${String(currentTime)}
        style=${rangeProgressStyle(timelineProgress)}
        aria-label=${this.localize("media_player.seek")}
        aria-valuetext=${timeLabel}
        @input=${this._seek}
      />
      <output class="time" aria-hidden="true">${timeLabel}</output>
      <button
        class="transport-button"
        type="button"
        data-control="toggle_mute"
        title=${this.localize(
          this.muted ? "media_player.unmute" : "media_player.mute",
        )}
        aria-label=${this.localize(
          this.muted ? "media_player.unmute" : "media_player.mute",
        )}
        @pointerup=${releaseTouchFocus}
        @click=${() => this._dispatch("toggle_mute")}
      >
        ${renderIcon(this.muted || this.volume === 0 ? "volumeOff" : "volumeOn")}
      </button>
      <input
        class="volume"
        type="range"
        min="0"
        max="1"
        step="0.01"
        .value=${String(this.volume)}
        style=${rangeProgressStyle(volumeProgress)}
        aria-label=${this.localize("media_player.volume")}
        @input=${this._changeVolume}
      />
      <button
        class="transport-button future-control"
        type="button"
        data-control="future"
        title=${this.localize("media_player.future_control")}
        aria-label=${this.localize("media_player.future_control")}
        disabled
      >
        ${renderIcon("dotsHorizontalCircleOutline")}
      </button>
    </div>`;
  }

  private readonly _seek = (event: Event): void => {
    this._dispatch(
      "seek",
      Number((event.currentTarget as HTMLInputElement).value),
    );
  };

  private readonly _changeVolume = (event: Event): void => {
    this._dispatch(
      "volume",
      Number((event.currentTarget as HTMLInputElement).value),
    );
  };

  private readonly _beginPointerInteraction = (event: PointerEvent): void => {
    event.stopPropagation();
    this._dispatchHold(true);
  };

  private readonly _endPointerInteraction = (event: PointerEvent): void => {
    event.stopPropagation();
    releaseTouchFocus(event);
    this._dispatchHold(false);
  };

  private _dispatch(
    action: RecordedVideoTransportAction,
    value?: number,
  ): void {
    this.dispatchEvent(
      new CustomEvent<RecordedVideoTransportEventDetail>(
        RECORDED_VIDEO_TRANSPORT_EVENT,
        {
          bubbles: true,
          composed: true,
          detail: { action, value },
        },
      ),
    );
  }

  private _dispatchHold(active: boolean): void {
    this.dispatchEvent(
      new CustomEvent<RecordedVideoTransportHoldDetail>(
        RECORDED_VIDEO_TRANSPORT_HOLD_EVENT,
        {
          bubbles: true,
          composed: true,
          detail: { active },
        },
      ),
    );
  }

  static styles = recordedVideoTransportStyles;
}

function finiteMediaValue(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatMediaTime(value: number): string {
  const wholeSeconds = Math.floor(finiteMediaValue(value));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function rangeProgressStyle(percent: number): string {
  return `--wzc-recorded-range-progress: ${Math.max(0, Math.min(100, percent))}%`;
}

function stopPropagation(event: Event): void {
  event.stopPropagation();
}

if (!customElements.get(RECORDED_VIDEO_TRANSPORT_TAG)) {
  customElements.define(RECORDED_VIDEO_TRANSPORT_TAG, RecordedVideoTransport);
}

declare global {
  interface HTMLElementTagNameMap {
    [RECORDED_VIDEO_TRANSPORT_TAG]: RecordedVideoTransport;
  }
}
