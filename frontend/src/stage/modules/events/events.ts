import { LitElement, type PropertyValues } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import { listEvents, type EventItem } from "../../../api/events";
import { listReviews, type ReviewItem } from "../../../api/reviews";
import { activityRecordedMediaRequest } from "../../../core/activity-media";
import { homeAssistantDateKey } from "../../../core/date-time";
import {
  ActiveCameraActivityController,
  ActivityFilterController,
  type ActivityFilterContext,
} from "../../activity";
import type { CameraSelectionContext } from "../../camera-selection-context";
import type { MediaDateContext } from "../../media-date-context";
import {
  DEFAULT_EVENT_HISTORY_DAYS,
  EVENTS_TAG,
  ACTIVITY_LIST_INTENT_EVENT,
} from "../../../core/constants";
import type {
  HomeAssistantApi,
  HomeAssistantLocale,
} from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import type { ActivityListItem } from "../../../ui/activity-list";
import type { ActivityListIntent } from "../../../ui/activity-list";
import "../../../ui/activity-list";
import { openRecordedMedia } from "../../../core/recorded-media";
import { ToastManager } from "../../../ui/toast-manager";
import "../../../ui/toast-region";
import { eventsStyles } from "./events.styles";

const activityListIntentEvent = unsafeStatic(ACTIVITY_LIST_INTENT_EVENT);

/** Active-camera event list with authoritative refresh reconciliation. */
export class EventsModule extends LitElement {
  public static properties = {
    api: { attribute: false },
    activityFilter: { attribute: false },
    cameraSelection: { attribute: false },
    displayEventTypeBadges: { attribute: false },
    displayObjectBadges: { attribute: false },
    displayZone: { attribute: false },
    historyDays: { attribute: false },
    localize: { attribute: false },
    mediaDate: { attribute: false },
    roundedCorners: { attribute: false, type: Boolean },
    shadows: { attribute: false, type: Boolean },
    targetModuleId: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public activityFilter?: ActivityFilterContext;
  public cameraSelection?: CameraSelectionContext;
  public displayEventTypeBadges = true;
  public displayObjectBadges = true;
  public displayZone = true;
  public historyDays = DEFAULT_EVENT_HISTORY_DAYS;
  public localize: LocalizeFunction = englishLocalize;
  public mediaDate?: MediaDateContext;
  public roundedCorners = true;
  public shadows = true;
  public targetModuleId = "";

  private readonly _toasts = new ToastManager(this);
  private _publishedActivity?: readonly EventItem[];
  private _publishedEntityId?: string;
  private _publishedFilter?: ActivityFilterContext;
  private _publishedReviewActivity?: readonly ReviewItem[];
  private _publishedDateEntityId?: string;
  private _publishedDateContext?: MediaDateContext;
  private readonly _filter = new ActivityFilterController(
    this,
    () => this.activityFilter,
    () => this.mediaDate,
    () => this.cameraSelection,
    () => this.targetModuleId,
    () => this.api?.locale,
    "events",
  );
  private readonly _activity = new ActiveCameraActivityController<EventItem>(
    this,
    () => ({
      api: this.api,
      cameraSelection: this.cameraSelection,
      historyDays: this.historyDays,
      targetModuleId: this.targetModuleId,
    }),
    listEvents,
    () =>
      this._toasts.error(this.localize("events.load_failed"), {
        key: "events-load-failed",
      }),
    "events",
  );
  private readonly _reviewActivity =
    new ActiveCameraActivityController<ReviewItem>(
      this,
      () => ({
        api: this._needsReviewFacets() ? this.api : undefined,
        cameraSelection: this._needsReviewFacets()
          ? this.cameraSelection
          : undefined,
        historyDays: this.historyDays,
        targetModuleId: this._needsReviewFacets() ? this.targetModuleId : "",
      }),
      listReviews,
      () => undefined,
      "reviews",
      (notification) => notification.review,
      (state) => state.activeReviews ?? [],
    );

  public disconnectedCallback(): void {
    this._clearPublishedDates();
    super.disconnectedCallback();
  }

  protected update(changed: PropertyValues<this>): void {
    const entityId = this._activity.activeEntityId;
    if (
      entityId &&
      this.activityFilter &&
      (this._publishedActivity !== this._activity.items ||
        this._publishedEntityId !== entityId ||
        this._publishedFilter !== this.activityFilter)
    ) {
      this._publishedActivity = this._activity.items;
      this._publishedEntityId = entityId;
      this._publishedFilter = this.activityFilter;
      this.activityFilter.publishEvents(
        entityId,
        this._activity.items.map((event) => ({
          id: event.id,
          labels: [event.label, ...(event.sub_label ? [event.sub_label] : [])],
          zones: event.zones,
        })),
      );
    }
    if (
      entityId &&
      this.activityFilter &&
      this._reviewActivity.activeEntityId === entityId &&
      this._publishedReviewActivity !== this._reviewActivity.items
    ) {
      this._publishedReviewActivity = this._reviewActivity.items;
      this.activityFilter.publishReviews(
        entityId,
        this._reviewActivity.items.map((review) => ({
          classification: review.classification,
          id: review.id,
          labels: [...review.labels, ...review.sub_labels],
          relatedEventIds: review.related_event_ids,
          reviewed: review.reviewed,
          zones: review.zones,
        })),
      );
    }
    this._publishAvailableDates();
    super.update(changed);
  }

  private _needsReviewFacets(): boolean {
    return (
      this._filter.state.reviews.length === 0 &&
      (this._filter.state.classification !== "all" ||
        this._filter.state.reviewStatus !== "all")
    );
  }

  private _publishAvailableDates(): void {
    const entityId = this._activity.activeEntityId;
    const context = this.mediaDate;
    if (
      this._publishedDateContext &&
      this._publishedDateEntityId &&
      (this._publishedDateContext !== context ||
        this._publishedDateEntityId !== entityId)
    ) {
      this._publishedDateContext.clearAvailableDates(
        this._publishedDateEntityId,
        this,
      );
    }
    this._publishedDateContext = context;
    this._publishedDateEntityId = entityId;
    if (!context || !entityId) return;
    context.publishAvailableDates(
      entityId,
      this,
      activityDates(this._activity.items, this.api?.locale),
    );
  }

  private _clearPublishedDates(): void {
    if (this._publishedDateContext && this._publishedDateEntityId) {
      this._publishedDateContext.clearAvailableDates(
        this._publishedDateEntityId,
        this,
      );
    }
    this._publishedDateContext = undefined;
    this._publishedDateEntityId = undefined;
  }

  protected render() {
    const items = this._activity.items
      .filter((event) =>
        this._filter.includesEvent({
          id: event.id,
          labels: [event.label, ...(event.sub_label ? [event.sub_label] : [])],
          startTime: event.start_time,
          zones: event.zones,
        }),
      )
      .map((event): ActivityListItem => ({
        cameraLabel: this._activity.activeCameraLabel ?? event.camera,
        clipUrl: event.clip_url,
        endTime: event.end_time,
        id: event.id,
        objectLabels: [
          event.label,
          ...(event.sub_label ? [event.sub_label] : []),
        ],
        playbackSources: event.playback_sources,
        playable: event.playback_sources.length > 0,
        preferredTransport: event.preferred_transport,
        revision: event.revision,
        snapshotUrl: event.snapshot_url,
        startTime: event.start_time,
        thumbnailUrl: event.thumbnail_url,
        typeBadge: event.has_clip
          ? { label: this.localize("events.clip"), variant: "success" }
          : undefined,
        zones: event.zones,
      }));
    return staticHtml`
      <wzc-activity-list
        .displayObjectBadges=${this.displayObjectBadges}
        .displayTypeBadges=${this.displayEventTypeBadges}
        .displayZone=${this.displayZone}
        .items=${items}
        .loading=${this._activity.loading}
        .locale=${this.api?.locale}
        .localize=${this.localize}
        .resolveUrl=${this.api?.resolveUrl}
        .roundedCorners=${this.roundedCorners}
        .selectedDate=${this._filter.selectedDate()}
        .shadows=${this.shadows}
        @${activityListIntentEvent}=${this._handleActivityIntent}
      ></wzc-activity-list>
      <wzc-toast-region .notices=${this._toasts.notices}></wzc-toast-region>
    `;
  }

  private readonly _handleActivityIntent = (
    event: CustomEvent<ActivityListIntent>,
  ): void => {
    event.stopPropagation();
    const intent = event.detail;
    if (intent.kind === "retry_media") {
      this._activity.retryMedia(intent.item, intent.url);
      return;
    }
    if (intent.kind !== "open_media") return;
    const request = activityRecordedMediaRequest(
      intent.item,
      intent.media,
      "event",
      this.api,
    );
    if (request) openRecordedMedia(this, request);
  };

  static styles = eventsStyles;
}

if (!customElements.get(EVENTS_TAG)) {
  customElements.define(EVENTS_TAG, EventsModule);
}

function activityDates(
  items: readonly EventItem[],
  locale: HomeAssistantLocale | undefined,
): readonly string[] {
  return [
    ...new Set(
      items.map(({ start_time }) => homeAssistantDateKey(start_time, locale)),
    ),
  ].sort();
}

declare global {
  interface HTMLElementTagNameMap {
    [EVENTS_TAG]: EventsModule;
  }
}
