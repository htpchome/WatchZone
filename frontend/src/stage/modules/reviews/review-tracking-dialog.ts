import { html, LitElement, nothing, type PropertyValues } from "lit";

import type {
  ReviewClassification,
  ReviewTrackedObject,
  ReviewTrackingDetails,
  ReviewTrackingEvent,
} from "../../../api/reviews";
import {
  REVIEW_TRACKING_CLOSE_EVENT,
  REVIEW_TRACKING_DIALOG_TAG,
  REVIEW_TRACKING_RETRY_EVENT,
} from "../../../core/constants";
import {
  formatHomeAssistantEventDate,
  formatHomeAssistantTime,
} from "../../../core/date-time";
import type { HomeAssistantLocale } from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
  type TranslationKey,
} from "../../../core/localization";
import { homeAssistantNumberFormat } from "../../../core/number-format";
import { centerDialogOnCard } from "../../../ui/dialog-position";
import { renderIcon } from "../../../ui/icons";
import { reviewDialogBaseStyles } from "./review-dialog.styles";
import { reviewTrackingDialogStyles } from "./review-tracking-dialog.styles";

export interface ReviewTrackingDialogModel {
  readonly analysisTitle?: string;
  readonly classification: ReviewClassification;
  readonly details?: ReviewTrackingDetails;
  readonly endTime: number | null;
  readonly failed: boolean;
  readonly loading: boolean;
  readonly startTime: number;
}

/** Reviews-only presentation for provider-normalized object tracking details. */
export class ReviewTrackingDialog extends LitElement {
  public static properties = {
    localize: { attribute: false },
    locale: { attribute: false },
    model: { attribute: false },
  };

  public localize: LocalizeFunction = englishLocalize;
  public locale?: HomeAssistantLocale;
  public model?: ReviewTrackingDialogModel;

  private _activeEventId?: string;
  private _activeEventPlacement: "above" | "below" = "below";

  protected render() {
    const model = this.model;
    return html`<dialog
      aria-labelledby="tracking-heading"
      @cancel=${this._close}
      @click=${this._backdropClick}
      @scroll=${this._hideActiveEvent}
    >
      ${
        model
          ? html`<header>
                <button
                  class="close"
                  type="button"
                  title=${this.localize("reviews.close_tracking_details")}
                  aria-label=${this.localize("reviews.close_tracking_details")}
                  @click=${this._close}
                >
                  <ha-icon icon="mdi:close"></ha-icon>
                </button>
                <h2 id="tracking-heading">
                  ${this.localize("reviews.tracking_details")}
                </h2>
              </header>
              <section class=${`tracking ${model.classification}`}>
                ${this._renderSummary(model)} ${this._renderContent(model)}
              </section>`
          : nothing
      }
    </dialog>`;
  }

  protected updated(changed: PropertyValues<this>): void {
    if (!changed.has("model")) return;
    this._activeEventId = undefined;
    const dialog = this.renderRoot.querySelector("dialog");
    if (!dialog) return;
    if (this.model && !dialog.open) {
      dialog.showModal();
      centerDialogOnCard(this, dialog);
    } else if (!this.model && dialog.open) dialog.close();
  }

  private _renderSummary(model: ReviewTrackingDialogModel) {
    const start = new Date(model.startTime * 1000);
    const end = model.endTime ?? model.startTime;
    const objectCount = model.details?.objects.length;
    return html`<div class="summary">
      <span class="classification-dot" aria-hidden="true"></span>
      <div class="summary-content">
        <strong>${formatHomeAssistantTime(start, this.locale)}</strong>
        ${
          model.analysisTitle
            ? html`<span class="analysis-summary">
                <ha-icon icon="mdi:creation"></ha-icon>
                <span>${model.analysisTitle}</span>
              </span>`
            : nothing
        }
        ${
          objectCount === undefined
            ? nothing
            : html`<span class="summary-meta">
                ${this.localize(
                  objectCount === 1
                    ? "reviews.tracking_object_count_one"
                    : "reviews.tracking_object_count",
                  { count: objectCount },
                )}
                ·
                ${formatDuration(Math.max(0, end - model.startTime), this.locale)}
              </span>`
        }
        <span class="summary-date">
          ${formatHomeAssistantEventDate(start, this.locale)}
        </span>
      </div>
    </div>`;
  }

  private _renderContent(model: ReviewTrackingDialogModel) {
    if (model.loading) {
      return html`<div class="status" role="status">
        <ha-spinner size="small"></ha-spinner>
        <span>${this.localize("reviews.tracking_loading")}</span>
      </div>`;
    }
    if (model.failed) {
      return html`<div class="status error" role="alert">
        <span>${this.localize("reviews.tracking_load_failed")}</span>
        <button class="retry" type="button" @click=${this._retry}>
          ${this.localize("common.retry")}
        </button>
      </div>`;
    }
    const objects = model.details?.objects ?? [];
    if (objects.length === 0) {
      return html`<p class="empty">
        ${this.localize("reviews.tracking_empty")}
      </p>`;
    }
    return html`<div class="objects">
      ${objects.map((object) => this._renderObject(object))}
    </div>`;
  }

  private _renderObject(object: ReviewTrackedObject) {
    const name = displayLabel(object);
    return html`<article class="tracked-object">
      <h3>
        <span class="object-icon" aria-hidden="true">
          ${renderIcon("account")}
        </span>
        <span>${capitalize(name, this.locale?.language)}</span>
        <span class="object-range">
          ${formatHomeAssistantTime(
            new Date(object.start_time * 1000),
            this.locale,
          )}${
            object.end_time === null
              ? ""
              : ` – ${formatHomeAssistantTime(
                  new Date(object.end_time * 1000),
                  this.locale,
                )}`
          }
        </span>
      </h3>
      <div class="lifecycle">
        ${object.events.map((event, index) =>
          this._renderEvent(object, event, index),
        )}
      </div>
    </article>`;
  }

  private _renderEvent(
    object: ReviewTrackedObject,
    event: ReviewTrackingEvent,
    index: number,
  ) {
    const eventId = `${object.id}:${index}`;
    const metricsId = `tracking-metrics-${eventId}`;
    const active = this._activeEventId === eventId;
    const label = displayLabel(object);
    return html`<div class=${`lifecycle-item ${active ? "active" : ""}`}>
      <span class="timeline-dot" aria-hidden="true"></span>
      <button
        class="lifecycle-event"
        type="button"
        aria-describedby=${active ? metricsId : nothing}
        aria-expanded=${active ? "true" : "false"}
        @pointerenter=${(pointer: PointerEvent) => {
          if (pointer.pointerType === "mouse") {
            this._showEvent(eventId, pointer.currentTarget as HTMLElement);
          }
        }}
        @pointerleave=${(pointer: PointerEvent) => {
          if (
            pointer.pointerType === "mouse" &&
            !(pointer.currentTarget as HTMLElement).matches(":focus")
          ) {
            this._hideEvent(eventId);
          }
        }}
        @focus=${(event: FocusEvent) =>
          this._showEvent(eventId, event.currentTarget as HTMLElement)}
        @blur=${() => this._hideEvent(eventId)}
        @click=${(event: MouseEvent) =>
          this._showEvent(eventId, event.currentTarget as HTMLElement)}
      >
        <span>${this._eventLabel(event, label)}</span>
        <time
          >${formatHomeAssistantTime(new Date(event.timestamp * 1000), this.locale)}</time
        >
      </button>
      ${
        active
          ? this._renderMetrics(event, metricsId, this._activeEventPlacement)
          : nothing
      }
    </div>`;
  }

  private _eventLabel(event: ReviewTrackingEvent, label: string): string {
    const key: TranslationKey = `reviews.tracking_${event.kind}`;
    return this.localize(key, {
      label: capitalize(label, this.locale?.language),
      zones: event.zones.join(", "),
    });
  }

  private _renderMetrics(
    event: ReviewTrackingEvent,
    metricsId: string,
    placement: "above" | "below",
  ) {
    const percent = homeAssistantNumberFormat(this.locale, {
      maximumFractionDigits: 0,
      style: "percent",
    });
    const number = homeAssistantNumberFormat(this.locale, {
      maximumFractionDigits: 2,
    });
    const integer = homeAssistantNumberFormat(this.locale, {
      maximumFractionDigits: 0,
    });
    const hasMetrics =
      event.score !== null || event.ratio !== null || event.area !== null;
    return html`<div
      class=${`event-metrics ${placement}`}
      id=${metricsId}
      role="tooltip"
    >
      ${
        hasMetrics
          ? html`${
              event.score === null
                ? nothing
                : html`<span>
                    ${this.localize("reviews.tracking_score")}
                    <strong>${percent.format(event.score)}</strong>
                  </span>`
            }
            ${
              event.ratio === null
                ? nothing
                : html`<span>
                    ${this.localize("reviews.tracking_ratio")}
                    <strong>${number.format(event.ratio)}</strong>
                  </span>`
            }
            ${
              event.area === null
                ? nothing
                : html`<span>
                    ${this.localize("reviews.tracking_area")}
                    <strong>${integer.format(event.area)}px</strong>
                    ${
                      event.area_percentage === null
                        ? nothing
                        : html` ·
                            <strong
                              >${number.format(event.area_percentage)}%</strong
                            >`
                    }
                  </span>`
            }`
          : this.localize("reviews.tracking_metrics_unavailable")
      }
    </div>`;
  }

  private _showEvent(eventId: string, target: HTMLElement): void {
    const dialog = this.renderRoot.querySelector("dialog");
    if (dialog) {
      const dialogBounds = dialog.getBoundingClientRect();
      const targetBounds = target.getBoundingClientRect();
      this._activeEventPlacement =
        dialogBounds.bottom - targetBounds.bottom >=
        targetBounds.top - dialogBounds.top
          ? "below"
          : "above";
    }
    if (this._activeEventId === eventId) return;
    this._activeEventId = eventId;
    this.requestUpdate();
  }

  private _hideEvent(eventId: string): void {
    if (this._activeEventId !== eventId) return;
    this._activeEventId = undefined;
    this.requestUpdate();
  }

  private readonly _hideActiveEvent = (): void => {
    if (this._activeEventId === undefined) return;
    this._activeEventId = undefined;
    this.requestUpdate();
  };

  private readonly _backdropClick = (event: MouseEvent): void => {
    if (event.target === event.currentTarget) this._close(event);
  };

  private readonly _close = (event: Event): void => {
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent(REVIEW_TRACKING_CLOSE_EVENT, {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private readonly _retry = (): void => {
    this.dispatchEvent(
      new CustomEvent(REVIEW_TRACKING_RETRY_EVENT, {
        bubbles: true,
        composed: true,
      }),
    );
  };

  static styles = [reviewDialogBaseStyles, reviewTrackingDialogStyles];
}

function displayLabel(object: ReviewTrackedObject): string {
  return object.sub_label ?? object.label;
}

function capitalize(value: string, locale?: string): string {
  const characters = Array.from(value.trim().replaceAll("_", " "));
  const first = characters.shift();
  return first
    ? `${first.toLocaleUpperCase(locale)}${characters.join("")}`
    : "";
}

function formatDuration(
  seconds: number,
  locale: HomeAssistantLocale | undefined,
): string {
  const rounded = Math.round(seconds);
  if (rounded < 60) {
    return `${homeAssistantNumberFormat(locale, {
      maximumFractionDigits: 0,
    }).format(rounded)}s`;
  }
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${homeAssistantNumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(minutes)}:${homeAssistantNumberFormat(locale, {
    maximumFractionDigits: 0,
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(remainder)}`;
}

if (!customElements.get(REVIEW_TRACKING_DIALOG_TAG)) {
  customElements.define(REVIEW_TRACKING_DIALOG_TAG, ReviewTrackingDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    [REVIEW_TRACKING_DIALOG_TAG]: ReviewTrackingDialog;
  }
}
