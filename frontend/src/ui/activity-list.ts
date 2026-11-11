import { html, LitElement } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";

import {
  ACTIVITY_LIST_INTENT_EVENT,
  ACTIVITY_LIST_TAG,
} from "../core/constants";
import {
  formatHomeAssistantDateKey,
  formatHomeAssistantEventDate,
  formatHomeAssistantTime,
  homeAssistantDateKey,
} from "../core/date-time";
import type { HomeAssistantApi } from "../core/home-assistant";
import type {
  RecordedMediaSource,
  RecordedMediaTransport,
} from "../core/recorded-media";
import { homeAssistantNumberFormat } from "../core/number-format";
import {
  englishLocalize,
  type LocalizeFunction,
  type TranslationKey,
} from "../core/localization";
import { distinctBadgeColorsForLabels, type BadgeColor } from "./badge-colors";
import { renderIcon } from "./icons";
import { activityMediaTitle } from "../core/activity-media";
import type { BadgeVariant } from "./badge";
import "./badge";
import "./media-day-header";
import { activityListStyles } from "./activity-list.styles";

export type ActivityClassification = "alert" | "detection";

export interface ActivityTypeBadge {
  readonly label: string;
  readonly variant: BadgeVariant;
}

export interface ActivityListItem {
  readonly analysisDescription?: string;
  readonly analysisConcerns?: readonly string[];
  readonly analysisScore?: number;
  readonly analysisTitle?: string;
  readonly cameraLabel: string;
  readonly classification?: ActivityClassification;
  readonly clipUrl: string | null;
  readonly endTime: number | null;
  readonly exportable?: boolean;
  readonly exportPending?: boolean;
  readonly hoverPreviewUrl?: string | null;
  readonly id: string;
  readonly inProgress?: boolean;
  readonly mediaEndTime?: number;
  readonly mediaStartTime?: number;
  readonly objectLabels: readonly string[];
  readonly playbackSources: readonly RecordedMediaSource[];
  readonly playable: boolean;
  readonly preferredTransport: RecordedMediaTransport;
  readonly reviewed?: boolean;
  readonly reviewStatePending?: boolean;
  readonly revision: string;
  readonly snapshotUrl: string | null;
  readonly startTime: number;
  readonly thumbnailUrl: string | null;
  readonly typeBadge?: ActivityTypeBadge;
  readonly zones: readonly string[];
}

export type ActivityListIntent =
  | {
      readonly item: ActivityListItem;
      readonly kind: "open_analysis";
    }
  | {
      readonly item: ActivityListItem;
      readonly kind: "toggle_reviewed";
    }
  | {
      readonly item: ActivityListItem;
      readonly kind: "export";
    }
  | {
      readonly item: ActivityListItem;
      readonly kind: "open_media";
      readonly media: "snapshot" | "video";
    }
  | {
      readonly item: ActivityListItem;
      readonly kind: "retry_media";
      readonly url: string;
    };

const VIRTUALIZATION_THRESHOLD = 20;
const VIRTUALIZATION_OVERSCAN_ROWS = 3;

interface ActivityDayGroup {
  readonly dateKey: string;
  readonly items: ActivityListItem[];
  readonly label: string;
  readonly startIndex: number;
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
    roundedCorners: { attribute: false, type: Boolean },
    selectedDate: { attribute: false },
    shadows: { attribute: false, type: Boolean },
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
  public roundedCorners = true;
  public selectedDate?: string;
  public shadows = true;

  private readonly _failedMedia = new Set<string>();
  private _activeDateKey?: string;
  private _hoveredPreviewId?: string;
  private _dayHeaderHeight = 0;
  private _rowGap = 0;
  private _rowHeight = 0;
  private _virtualFrame?: number;
  private _windowEnd = VIRTUALIZATION_THRESHOLD;
  private _windowStart = 0;

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("items")) {
      this._activeDateKey = undefined;
      this._windowStart = 0;
      this._windowEnd = VIRTUALIZATION_THRESHOLD;
      const current = new Set(
        this.items.flatMap((item) =>
          [item.thumbnailUrl, item.snapshotUrl, item.hoverPreviewUrl]
            .filter((url): url is string => typeof url === "string")
            .map((url) => mediaKey(item, url)),
        ),
      );
      for (const key of this._failedMedia) {
        if (!current.has(key)) this._failedMedia.delete(key);
      }
    }
    this._scheduleVirtualWindowSync();
  }

  public disconnectedCallback(): void {
    if (this._virtualFrame !== undefined)
      cancelAnimationFrame(this._virtualFrame);
    this._virtualFrame = undefined;
    super.disconnectedCallback();
  }

  protected render() {
    const groups = this._dayGroups();
    const dayLabel =
      groups.find(({ dateKey }) => dateKey === this._activeDateKey)?.label ??
      groups[0]?.label ??
      this._fallbackDayLabel();
    return html`<section
      class=${[
        "viewport",
        this.roundedCorners ? "" : "square",
        this.shadows ? "" : "no-shadows",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label=${this.localize(this.listKey)}
      aria-busy=${this.loading ? "true" : "false"}
    >
      <wzc-media-day-header .label=${dayLabel}></wzc-media-day-header>
      <div class="scroller" @scroll=${this._handleScroll}>
        ${
          this.loading && this.items.length === 0
            ? html`<div class="list skeleton-list" aria-hidden="true">
                  ${Array.from(
                    { length: 5 },
                    () => html`<span class="skeleton-row"></span>`,
                  )}
                </div>
                <span class="visually-hidden">
                  ${this.localize(this.loadingKey)}
                </span>`
            : this.items.length === 0
              ? html`<div class="empty">${this.localize(this.emptyKey)}</div>`
              : this._renderList(groups)
        }
      </div>
    </section>`;
  }

  private _renderList(groups: readonly ActivityDayGroup[]) {
    const virtualized =
      this.items.length > VIRTUALIZATION_THRESHOLD &&
      this._rowHeight > 0 &&
      this._dayHeaderHeight > 0;
    const start = virtualized ? this._windowStart : 0;
    const end = virtualized
      ? Math.min(this.items.length, this._windowEnd)
      : Math.min(this.items.length, VIRTUALIZATION_THRESHOLD);
    const visibleGroups = virtualized
      ? groups
      : groups.filter(
          (group) =>
            group.startIndex < end &&
            group.startIndex + group.items.length > start,
        );
    return html`<div class=${virtualized ? "list virtualized" : "list"}>
      ${repeat(
        visibleGroups,
        ({ dateKey, startIndex }) => `${dateKey}:${startIndex}`,
        (group) => this._renderDayGroup(group, start, end, virtualized),
      )}
    </div>`;
  }

  private _renderDayGroup(
    group: ActivityDayGroup,
    start: number,
    end: number,
    virtualized: boolean,
  ) {
    const visibleItems = group.items
      .map((item, localIndex) => ({
        index: group.startIndex + localIndex,
        item,
        localIndex,
      }))
      .filter(({ index }) => index >= start && index < end);
    const hasDayHeading = group.startIndex > 0;
    const headingHeight = hasDayHeading
      ? this._dayHeaderHeight + this._dayHeaderGap()
      : 0;
    const groupHeight =
      headingHeight + group.items.length * (this._rowHeight + this._rowGap);
    return html`<section
      class=${virtualized ? "day-group virtualized" : "day-group"}
      data-date=${group.dateKey}
      style=${styleMap(virtualized ? { blockSize: `${groupHeight}px` } : {})}
    >
      ${
        hasDayHeading
          ? html`<wzc-media-day-header
              .label=${group.label}
            ></wzc-media-day-header>`
          : null
      }
      ${repeat(
        visibleItems,
        ({ item }) => item.id,
        ({ index, item, localIndex }) =>
          this._renderItem(item, index, localIndex, virtualized),
      )}
    </section>`;
  }

  private _renderItem(
    item: ActivityListItem,
    index: number,
    localIndex: number,
    virtualized: boolean,
  ) {
    const start = new Date(item.startTime * 1000);
    const previewUrl = [item.thumbnailUrl, item.snapshotUrl].find(
      (url): url is string =>
        url !== null && !this._failedMedia.has(mediaKey(item, url)),
    );
    const snapshotUrl = item.snapshotUrl;
    const hoverPreviewUrl = item.hoverPreviewUrl;
    const durationStart = item.mediaStartTime ?? item.startTime;
    const durationEnd = item.mediaEndTime ?? item.endTime ?? Date.now() / 1000;
    const duration = Math.max(1, Math.round(durationEnd - durationStart));
    const objectLabels = this.displayObjectBadges ? item.objectLabels : [];
    const typeBadge = this.displayTypeBadges ? item.typeBadge : undefined;
    const objectColors = distinctBadgeColorsForLabels(
      objectLabels,
      typeBadge ? [reservedColor(typeBadge.variant)] : [],
    );
    const title = activityMediaTitle(item, this.api);
    const playLabel = this.localize("media_player.open", { title });
    return html`<article
      class="tile"
      aria-posinset=${index + 1}
      aria-setsize=${this.items.length}
      style=${styleMap(
        virtualized
          ? {
              transform: `translateY(${localIndex * (this._rowHeight + this._rowGap)}px)`,
            }
          : {},
      )}
      @pointermove=${(event: PointerEvent) =>
        this._updateHoverPreview(event, item)}
      @pointerleave=${() => this._clearHoverPreview(item.id)}
    >
      ${
        item.playable
          ? html`<button
              class="tile-player"
              data-recorded-media-opener="true"
              type="button"
              title=${playLabel}
              aria-label=${playLabel}
              @click=${() => this._dispatch({ kind: "open_media", media: "video", item })}
            ></button>`
          : null
      }
      <div class=${`thumbnail-wrap ${item.classification ?? ""}`.trim()}>
        ${
          previewUrl
            ? html`<img
                class="thumbnail"
                loading="lazy"
                src=${this.api?.resolveUrl(previewUrl) ?? previewUrl}
                alt=${this.localize("events.thumbnail", {
                  label: objectLabels[0] ?? this.localize("reviews.activity"),
                })}
                @error=${() => this._mediaFailed(item, previewUrl)}
              />`
            : html`<div class="placeholder" aria-hidden="true">
                ${renderIcon("account")}
              </div>`
        }
        ${
          hoverPreviewUrl &&
          this._hoveredPreviewId === item.id &&
          !this._failedMedia.has(mediaKey(item, hoverPreviewUrl))
            ? html`<img
                class="thumbnail hover-preview"
                src=${this.api?.resolveUrl(hoverPreviewUrl) ?? hoverPreviewUrl}
                alt=""
                aria-hidden="true"
                @error=${() => this._mediaFailed(item, hoverPreviewUrl)}
              />`
            : null
        }
        <span class="duration"
          >${formatDuration(duration, this.api?.locale)}</span
        >
        ${
          item.inProgress
            ? html`<span class="in-progress"
                >${this.localize("reviews.progress")}</span
              >`
            : null
        }
      </div>
      ${
        item.analysisTitle && item.analysisDescription
          ? html`<div class="review-content">
              ${this._renderDetails(item, objectLabels, typeBadge, objectColors, start)}
              <button
                class="analysis-title"
                type="button"
                title=${this.localize("reviews.open_ai_analysis", {
                  title: item.analysisTitle,
                })}
                aria-label=${this.localize("reviews.open_ai_analysis", {
                  title: item.analysisTitle,
                })}
                @click=${(event: MouseEvent) => {
                  event.stopPropagation();
                  this._dispatch({ kind: "open_analysis", item });
                }}
              >
                <ha-icon icon="mdi:creation"></ha-icon>
                <span>${item.analysisTitle}</span>
              </button>
            </div>`
          : this._renderDetails(
              item,
              objectLabels,
              typeBadge,
              objectColors,
              start,
            )
      }
      <div class="actions">
        ${
          item.exportable
            ? html`<button
                class="action"
                type="button"
                title=${this.localize("reviews.export")}
                aria-label=${this.localize("reviews.export")}
                ?disabled=${item.exportPending === true}
                @click=${() => this._dispatch({ kind: "export", item })}
              >
                <ha-icon icon="mdi:export"></ha-icon>
              </button>`
            : null
        }
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
          snapshotUrl
            ? html`<button
                class="action"
                data-recorded-media-opener="true"
                type="button"
                title=${this.localize("events.view_snapshot")}
                aria-label=${this.localize("events.view_snapshot")}
                @click=${() =>
                  this._dispatch({
                    kind: "open_media",
                    media: "snapshot",
                    item,
                  })}
              >
                <ha-icon icon="mdi:camera"></ha-icon>
              </button>`
            : null
        }
      </div>
    </article>`;
  }

  private _renderDetails(
    item: ActivityListItem,
    objectLabels: readonly string[],
    typeBadge: ActivityTypeBadge | undefined,
    objectColors: readonly BadgeColor[],
    start: Date,
  ) {
    return html`<div class="details">
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
      ${
        item.reviewed !== undefined
          ? html`<button
              class=${`review-state ${item.reviewed ? "reviewed" : "unreviewed"}`}
              type="button"
              ?disabled=${item.reviewStatePending === true}
              title=${this.localize(
                item.reviewed
                  ? "reviews.mark_unreviewed"
                  : "reviews.mark_reviewed",
              )}
              aria-label=${this.localize(
                item.reviewed
                  ? "reviews.mark_unreviewed"
                  : "reviews.mark_reviewed",
              )}
              aria-pressed=${item.reviewed ? "true" : "false"}
              @click=${(event: MouseEvent) => {
                event.stopPropagation();
                this._dispatch({ kind: "toggle_reviewed", item });
              }}
            >
              <span class="review-state-indicator">
                ${renderIcon("check")}
              </span>
            </button>`
          : null
      }
    </div>`;
  }

  private readonly _handleScroll = (): void => {
    this._scheduleVirtualWindowSync();
    this._syncActiveDay();
  };

  private _syncActiveDay(): void {
    const scroller = this.renderRoot.querySelector<HTMLElement>(".scroller");
    const groups = [
      ...this.renderRoot.querySelectorAll<HTMLElement>(".day-group"),
    ];
    if (!scroller || groups.length === 0) return;
    const top = scroller.getBoundingClientRect().top + 1;
    let active = groups[0]?.dataset.date;
    for (const group of groups) {
      if (group.getBoundingClientRect().top > top) break;
      active = group.dataset.date;
    }
    if (!active || active === this._activeDateKey) return;
    this._activeDateKey = active;
    this.requestUpdate();
  }

  private _dayHeaderGap(): number {
    return (
      Number.parseFloat(
        getComputedStyle(this).getPropertyValue("--wzc-media-day-header-gap"),
      ) || 0
    );
  }

  private _scheduleVirtualWindowSync(): void {
    if (
      this.items.length <= VIRTUALIZATION_THRESHOLD ||
      this._virtualFrame !== undefined
    )
      return;
    this._virtualFrame = requestAnimationFrame(() => {
      this._virtualFrame = undefined;
      this._syncVirtualWindow();
    });
  }

  private _syncVirtualWindow(): void {
    if (this.items.length <= VIRTUALIZATION_THRESHOLD) return;
    const viewport = this.renderRoot.querySelector<HTMLElement>(".scroller");
    const list = this.renderRoot.querySelector<HTMLElement>(".list");
    const tile = list?.querySelector<HTMLElement>(".tile");
    const group = list?.querySelector<HTMLElement>(".day-group");
    const dayHeader = this.renderRoot.querySelector<HTMLElement>(
      "wzc-media-day-header",
    );
    if (!viewport || !list || !group || !tile || !dayHeader) return;
    const nextRowHeight =
      Math.round(tile.getBoundingClientRect().height * 100) / 100;
    const nextDayHeaderHeight =
      Math.round(dayHeader.getBoundingClientRect().height * 100) / 100;
    const nextRowGap = group.classList.contains("virtualized")
      ? this._rowGap
      : Number.parseFloat(getComputedStyle(group).rowGap) || 0;
    if (nextRowHeight <= 0 || nextDayHeaderHeight <= 0) return;
    const stride = nextRowHeight + nextRowGap;
    const overscan = stride * VIRTUALIZATION_OVERSCAN_ROWS;
    const visibleStart = Math.max(0, viewport.scrollTop - overscan);
    const visibleEnd = viewport.scrollTop + viewport.clientHeight + overscan;
    let nextStart = this.items.length;
    let nextEnd = 0;
    let groupOffset = 0;
    for (const dayGroup of this._dayGroups()) {
      const headingHeight =
        dayGroup.startIndex > 0
          ? nextDayHeaderHeight + this._dayHeaderGap()
          : 0;
      for (
        let localIndex = 0;
        localIndex < dayGroup.items.length;
        localIndex++
      ) {
        const index = dayGroup.startIndex + localIndex;
        const itemStart = groupOffset + headingHeight + localIndex * stride;
        const itemEnd = itemStart + nextRowHeight;
        if (itemEnd >= visibleStart && itemStart <= visibleEnd) {
          nextStart = Math.min(nextStart, index);
          nextEnd = Math.max(nextEnd, index + 1);
        }
      }
      groupOffset += headingHeight + dayGroup.items.length * stride;
    }
    if (nextStart === this.items.length) {
      nextStart = Math.max(0, this.items.length - 1);
      nextEnd = this.items.length;
    }
    const changed =
      this._rowHeight !== nextRowHeight ||
      this._dayHeaderHeight !== nextDayHeaderHeight ||
      this._rowGap !== nextRowGap ||
      this._windowStart !== nextStart ||
      this._windowEnd !== nextEnd;
    this._rowHeight = nextRowHeight;
    this._dayHeaderHeight = nextDayHeaderHeight;
    this._rowGap = nextRowGap;
    this._windowStart = nextStart;
    this._windowEnd = nextEnd;
    if (changed) this.requestUpdate();
  }

  private _dayGroups(): readonly ActivityDayGroup[] {
    const groups: ActivityDayGroup[] = [];
    const moduleLabel = this._moduleLabel();
    for (const [index, item] of this.items.entries()) {
      const date = new Date(item.startTime * 1000);
      const dateKey = homeAssistantDateKey(item.startTime, this.api?.locale);
      const current = groups.at(-1);
      if (current?.dateKey === dateKey) {
        current.items.push(item);
        continue;
      }
      groups.push({
        dateKey,
        items: [item],
        label: `${formatHomeAssistantEventDate(date, this.api?.locale)} — ${moduleLabel}`,
        startIndex: index,
      });
    }
    return groups;
  }

  private _fallbackDayLabel(): string {
    const dateKey =
      this.selectedDate ??
      homeAssistantDateKey(Date.now() / 1000, this.api?.locale);
    return `${formatHomeAssistantDateKey(dateKey, this.api?.locale)} — ${this._moduleLabel()}`;
  }

  private _moduleLabel(): string {
    return this.localize(
      this.listKey === "reviews.list"
        ? "navigation.reviews"
        : "navigation.events",
    );
  }

  private _mediaFailed(item: ActivityListItem, url: string): void {
    this._failedMedia.add(mediaKey(item, url));
    this._dispatch({ kind: "retry_media", item, url });
    this.requestUpdate();
  }

  private _dispatch(detail: ActivityListIntent): void {
    this.dispatchEvent(
      new CustomEvent<ActivityListIntent>(ACTIVITY_LIST_INTENT_EVENT, {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
  }

  private _updateHoverPreview(
    event: PointerEvent,
    item: ActivityListItem,
  ): void {
    if (event.pointerType !== "mouse" || !item.hoverPreviewUrl) return;
    const thumbnail = (event.currentTarget as HTMLElement).querySelector(
      ".thumbnail-wrap",
    );
    if (!(thumbnail instanceof HTMLElement)) return;
    const bounds = thumbnail.getBoundingClientRect();
    const hovered =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom;
    const nextId = hovered ? item.id : undefined;
    if (nextId === this._hoveredPreviewId) return;
    this._hoveredPreviewId = nextId;
    this.requestUpdate();
  }

  private _clearHoverPreview(itemId: string): void {
    if (this._hoveredPreviewId !== itemId) return;
    this._hoveredPreviewId = undefined;
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

  interface HTMLElementEventMap {
    [ACTIVITY_LIST_INTENT_EVENT]: CustomEvent<ActivityListIntent>;
  }
}
