import { html, LitElement } from "lit";
import { repeat } from "lit/directives/repeat.js";

import { ACTIVITY_LIST_TAG } from "../core/constants";
import {
  formatHomeAssistantEventDate,
  formatHomeAssistantTime,
} from "../core/date-time";
import type { HomeAssistantApi } from "../core/home-assistant";
import { homeAssistantNumberFormat } from "../core/number-format";
import {
  englishLocalize,
  type LocalizeFunction,
  type TranslationKey,
} from "../core/localization";
import { distinctBadgeColorsForLabels, type BadgeColor } from "./badge-colors";
import { renderIcon } from "./icons";
import type { BadgeVariant } from "./badge";
import "./badge";
import { activityListStyles } from "./activity-list.styles";

export type ActivityClassification = "alert" | "detection";

export interface ActivityTypeBadge {
  readonly label: string;
  readonly variant: BadgeVariant;
}

export interface ActivityListItem {
  readonly classification?: ActivityClassification;
  readonly clipUrl: string | null;
  readonly endTime: number | null;
  readonly id: string;
  readonly objectLabels: readonly string[];
  readonly revision: string;
  readonly snapshotUrl: string | null;
  readonly startTime: number;
  readonly thumbnailUrl: string | null;
  readonly typeBadge?: ActivityTypeBadge;
  readonly zones: readonly string[];
}

/** Shared activity-tile presentation used by independent media modules. */
export class ActivityList extends LitElement {
  public static properties = {
    api: { attribute: false },
    displayObjectBadges: { attribute: false },
    displayTypeBadges: { attribute: false },
    displayZone: { attribute: false },
    emptyKey: { attribute: false },
    items: { attribute: false },
    listKey: { attribute: false },
    loading: { attribute: false },
    loadingKey: { attribute: false },
    localize: { attribute: false },
    retryMedia: { attribute: false },
    roundedCorners: { attribute: false, type: Boolean },
  };

  public api?: HomeAssistantApi;
  public displayObjectBadges = true;
  public displayTypeBadges = true;
  public displayZone = true;
  public emptyKey: TranslationKey = "events.empty";
  public items: readonly ActivityListItem[] = [];
  public listKey: TranslationKey = "events.list";
  public loading = false;
  public loadingKey: TranslationKey = "events.loading";
  public localize: LocalizeFunction = englishLocalize;
  public retryMedia?: (item: ActivityListItem, url: string) => void;
  public roundedCorners = true;

  private readonly _failedMedia = new Set<string>();

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (!changed.has("items")) return;
    const current = new Set(
      this.items.flatMap((item) =>
        [item.thumbnailUrl, item.snapshotUrl]
          .filter((url): url is string => url !== null)
          .map((url) => mediaKey(item, url)),
      ),
    );
    for (const key of this._failedMedia) {
      if (!current.has(key)) this._failedMedia.delete(key);
    }
  }

  protected render() {
    return html`<section
      class=${this.roundedCorners ? "viewport" : "viewport square"}
      aria-label=${this.localize(this.listKey)}
    >
      ${
        this.loading && this.items.length === 0
          ? html`<div class="loading">${this.localize(this.loadingKey)}</div>`
          : this.items.length === 0
            ? html`<div class="empty">${this.localize(this.emptyKey)}</div>`
            : html`<div class="list">
                ${repeat(
                  this.items,
                  (item) => item.id,
                  (item) => this._renderItem(item),
                )}
              </div>`
      }
    </section>`;
  }

  private _renderItem(item: ActivityListItem) {
    const start = new Date(item.startTime * 1000);
    const previewUrl = [item.thumbnailUrl, item.snapshotUrl].find(
      (url): url is string =>
        url !== null && !this._failedMedia.has(mediaKey(item, url)),
    );
    const duration = Math.max(
      1,
      Math.round((item.endTime ?? Date.now() / 1000) - item.startTime),
    );
    const objectLabels = this.displayObjectBadges ? item.objectLabels : [];
    const typeBadge = this.displayTypeBadges ? item.typeBadge : undefined;
    const objectColors = distinctBadgeColorsForLabels(
      objectLabels,
      typeBadge ? [reservedColor(typeBadge.variant)] : [],
    );
    return html`<article class="tile">
      <div class=${`thumbnail-wrap ${item.classification ?? ""}`.trim()}>
        ${
          previewUrl
            ? html`<img
                class="thumbnail"
                loading="lazy"
                src=${this.api?.resolveUrl(previewUrl) ?? previewUrl}
                alt=${this.localize("events.thumbnail", {
                  label: objectLabels[0] ?? this.localize("alerts.activity"),
                })}
                @error=${() => this._mediaFailed(item, previewUrl)}
              />`
            : html`<div class="placeholder" aria-hidden="true">
                ${renderIcon("account")}
              </div>`
        }
        <span class="duration"
          >${formatDuration(duration, this.api?.locale)}</span
        >
      </div>
      <div class="details">
        ${
          objectLabels.length > 0 || typeBadge
            ? html`<div class="badges">
                ${objectLabels.map(
                  (label, index) =>
                    html`<wzc-badge
                      color=${objectColors[index] ?? "neutral"}
                      shape="pill"
                      size="small"
                      >${capitalizeBadgeText(
                        label,
                        this.api?.locale?.language,
                      )}</wzc-badge
                    >`,
                )}
                ${
                  typeBadge
                    ? html`<wzc-badge
                        shape="pill"
                        size="small"
                        variant=${typeBadge.variant}
                        >${capitalizeBadgeText(
                          typeBadge.label,
                          this.api?.locale?.language,
                        )}</wzc-badge
                      >`
                    : null
                }
              </div>`
            : null
        }
        <div class="metadata">
          <span class="metadata-icon">${renderIcon("clock")}</span>
          <span>${formatHomeAssistantTime(start, this.api?.locale)}</span>
        </div>
        <div class="metadata">
          <span class="metadata-icon">${renderIcon("calendar")}</span>
          <span>${formatHomeAssistantEventDate(start, this.api?.locale)}</span>
        </div>
        ${
          this.displayZone && item.zones.length > 0
            ? html`<div class="metadata">
                <span class="metadata-icon">${renderIcon("mapMarker")}</span>
                <span>${item.zones.join(", ")}</span>
              </div>`
            : null
        }
      </div>
      <div class="actions">
        ${
          item.clipUrl
            ? html`<a
                class="action"
                href=${this.api?.resolveUrl(item.clipUrl) ?? item.clipUrl}
                download
                title=${this.localize("events.download_clip")}
                aria-label=${this.localize("events.download_clip")}
                ><ha-icon icon="mdi:download"></ha-icon
              ></a>`
            : null
        }
        ${
          item.snapshotUrl
            ? html`<a
                class="action"
                href=${this.api?.resolveUrl(item.snapshotUrl) ?? item.snapshotUrl}
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

  private _mediaFailed(item: ActivityListItem, url: string): void {
    this._failedMedia.add(mediaKey(item, url));
    this.retryMedia?.(item, url);
    this.requestUpdate();
  }

  static styles = activityListStyles;
}

function mediaKey(item: ActivityListItem, url: string): string {
  return `${item.id}:${item.revision}:${url}`;
}

function reservedColor(variant: BadgeVariant): BadgeColor {
  if (variant === "danger") return "red";
  if (variant === "warning") return "amber";
  if (variant === "success") return "green";
  if (variant === "accent") return "blue";
  return "neutral";
}

function capitalizeBadgeText(value: string, locale?: string): string {
  const characters = Array.from(value.trim());
  const first = characters.shift();
  return first
    ? `${first.toLocaleUpperCase(locale)}${characters.join("")}`
    : "";
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

if (!customElements.get(ACTIVITY_LIST_TAG)) {
  customElements.define(ACTIVITY_LIST_TAG, ActivityList);
}

declare global {
  interface HTMLElementTagNameMap {
    [ACTIVITY_LIST_TAG]: ActivityList;
  }
}
