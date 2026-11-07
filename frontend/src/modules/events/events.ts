import { html, LitElement } from "lit";
import { repeat } from "lit/directives/repeat.js";

import { listEvents, type EventItem } from "../../api/events";
import type { CameraSelectionContext } from "../../core/camera-selection-context";
import {
  formatHomeAssistantDate,
  formatHomeAssistantTime,
} from "../../core/date-time";
import {
  DEFAULT_EVENT_HISTORY_DAYS,
  EVENTS_REFRESH_INTERVAL_MS,
  EVENTS_TAG,
} from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import { homeAssistantNumberFormat } from "../../core/number-format";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { badgeColorForLabel } from "../../ui/badge-colors";
import { ToastManager } from "../../ui/toast-manager";
import "../../ui/badge";
import "../../ui/toast-region";
import { eventsStyles } from "./events.styles";

/** Active-camera event list with authoritative refresh reconciliation. */
export class EventsModule extends LitElement {
  public static properties = {
    api: { attribute: false },
    cameraSelection: { attribute: false },
    historyDays: { attribute: false },
    localize: { attribute: false },
    roundedCorners: { attribute: false, type: Boolean },
    targetModuleId: { attribute: false },
    _events: { state: true },
    _loading: { state: true },
  };

  public api?: HomeAssistantApi;
  public cameraSelection?: CameraSelectionContext;
  public historyDays = DEFAULT_EVENT_HISTORY_DAYS;
  public localize: LocalizeFunction = englishLocalize;
  public roundedCorners = true;
  public targetModuleId = "";

  private _activeEntityId?: string;
  private _events: readonly EventItem[] = [];
  private _generation = 0;
  private _loading = false;
  private _refreshTimer?: number;
  private _unsubscribe?: () => void;
  private readonly _failedMedia = new Set<string>();
  private readonly _retriedMedia = new Set<string>();
  private readonly _toasts = new ToastManager(this);

  public connectedCallback(): void {
    super.connectedCallback();
    this._subscribe();
  }

  public disconnectedCallback(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._stopRefresh();
    this._generation += 1;
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("cameraSelection") || changed.has("targetModuleId")) {
      this._subscribe();
    }
    if (
      changed.has("historyDays") &&
      !changed.has("cameraSelection") &&
      !changed.has("targetModuleId") &&
      this._activeEntityId
    ) {
      this._generation += 1;
      void this._refresh(false);
    }
  }

  protected render() {
    return html`
      <section
        class=${this.roundedCorners ? "viewport" : "viewport square"}
        aria-label=${this.localize("events.list")}
      >
        ${
          this._loading && this._events.length === 0
            ? html`<div class="loading">
                ${this.localize("events.loading")}
              </div>`
            : this._events.length === 0
              ? html`<div class="empty">${this.localize("events.empty")}</div>`
              : html`<div class="list">
                  ${repeat(
                    this._events,
                    (event) => event.id,
                    (event) => this._renderEvent(event),
                  )}
                </div>`
        }
      </section>
      <wzc-toast-region .notices=${this._toasts.notices}></wzc-toast-region>
    `;
  }

  private _renderEvent(event: EventItem) {
    const start = new Date(event.start_time * 1000);
    const previewUrl = event.snapshot_url ?? event.thumbnail_url;
    const duration = Math.max(
      1,
      Math.round((event.end_time ?? Date.now() / 1000) - event.start_time),
    );
    return html`<article class="tile">
      <div class="thumbnail-wrap">
        ${
          previewUrl && !this._failedMedia.has(`${event.id}:${event.revision}`)
            ? html`<img
                class="thumbnail"
                loading="lazy"
                src=${this.api?.resolveUrl(previewUrl) ?? previewUrl}
                alt=${this.localize("events.thumbnail", { label: event.label })}
                @error=${() => this._mediaFailed(event)}
              />`
            : html`<div class="placeholder">
                <ha-icon icon="mdi:image-off"></ha-icon>
              </div>`
        }
        <span class="duration"
          >${formatDuration(duration, this.api?.locale)}</span
        >
      </div>
      <div class="details">
        <div class="badges">
          <wzc-badge color=${badgeColorForLabel(event.label)}
            >${event.label}</wzc-badge
          >
          ${
            event.sub_label
              ? html`<wzc-badge color=${badgeColorForLabel(event.sub_label)}
                  >${event.sub_label}</wzc-badge
                >`
              : null
          }
          ${
            event.has_clip
              ? html`<wzc-badge variant="success"
                  >${this.localize("events.clip")}</wzc-badge
                >`
              : null
          }
        </div>
        <div class="metadata">${this._formatTime(start)}</div>
        <div class="metadata">${this._formatDate(start)}</div>
        <div class="metadata">${event.camera}</div>
      </div>
      <div class="actions">
        ${
          event.clip_url
            ? html`<a
                class="action"
                href=${this.api?.resolveUrl(event.clip_url) ?? event.clip_url}
                download
                title=${this.localize("events.download_clip")}
                aria-label=${this.localize("events.download_clip")}
                ><ha-icon icon="mdi:download"></ha-icon
              ></a>`
            : null
        }
        ${
          event.snapshot_url
            ? html`<a
                class="action"
                href=${this.api?.resolveUrl(event.snapshot_url) ?? event.snapshot_url}
                target="_blank"
                rel="noopener"
                title=${this.localize("events.view_snapshot")}
                aria-label=${this.localize("events.view_snapshot")}
                ><ha-icon icon="mdi:camera"></ha-icon
              ></a>`
            : null
        }
      </div>
    </article>`;
  }

  private _subscribe(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    if (!this.isConnected || !this.cameraSelection || !this.targetModuleId)
      return;
    this._unsubscribe = this.cameraSelection.subscribe(
      this.targetModuleId,
      ({ activeEntityId }) => {
        if (activeEntityId === this._activeEntityId) return;
        this._activeEntityId = activeEntityId;
        this._events = [];
        this._failedMedia.clear();
        this._retriedMedia.clear();
        this._stopRefresh();
        this._generation += 1;
        if (activeEntityId) {
          void this._refresh(false);
          this._refreshTimer = window.setInterval(
            () => void this._refresh(false),
            EVENTS_REFRESH_INTERVAL_MS,
          );
        }
      },
    );
  }

  private async _refresh(bypassCache: boolean): Promise<void> {
    const api = this.api;
    const entityId = this._activeEntityId;
    if (!api || !entityId) return;
    const generation = this._generation;
    this._loading = true;
    try {
      const items = await listEvents(api, entityId, {
        bypassCache,
        historyDays: this.historyDays,
      });
      if (generation !== this._generation || entityId !== this._activeEntityId)
        return;
      this._events = items;
      const current = new Set(
        items.map((item) => `${item.id}:${item.revision}`),
      );
      for (const key of this._failedMedia) {
        if (!current.has(key)) this._failedMedia.delete(key);
      }
      for (const key of this._retriedMedia) {
        if (!current.has(key)) this._retriedMedia.delete(key);
      }
    } catch {
      if (generation === this._generation) {
        this._toasts.error(this.localize("events.load_failed"), {
          key: "events-load-failed",
        });
      }
    } finally {
      if (generation === this._generation) this._loading = false;
    }
  }

  private _mediaFailed(event: EventItem): void {
    const key = `${event.id}:${event.revision}`;
    if (this._retriedMedia.has(key)) {
      this._failedMedia.add(key);
      this.requestUpdate();
      return;
    }
    this._retriedMedia.add(key);
    void this._refresh(true);
  }

  private _formatTime(date: Date): string {
    return formatHomeAssistantTime(date, this.api?.locale);
  }

  private _formatDate(date: Date): string {
    return formatHomeAssistantDate(date, this.api?.locale);
  }

  private _stopRefresh(): void {
    if (this._refreshTimer !== undefined)
      window.clearInterval(this._refreshTimer);
    this._refreshTimer = undefined;
  }

  static styles = eventsStyles;
}

function formatDuration(
  seconds: number,
  locale: HomeAssistantApi["locale"],
): string {
  if (seconds < 60) {
    return `${homeAssistantNumberFormat(locale, {
      maximumFractionDigits: 0,
    }).format(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${homeAssistantNumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(minutes)}:${homeAssistantNumberFormat(locale, {
    maximumFractionDigits: 0,
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(remainder)}`;
}

if (!customElements.get(EVENTS_TAG)) {
  customElements.define(EVENTS_TAG, EventsModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [EVENTS_TAG]: EventsModule;
  }
}
