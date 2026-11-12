import { LitElement, type PropertyValues } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  listReviews,
  setReviewReviewed,
  type ReviewItem,
} from "../../../api/reviews";
import {
  ActiveCameraActivityController,
  ActivityFilterController,
  type ActivityFilterContext,
} from "../../activity";
import type { CameraSelectionContext } from "../../camera-selection-context";
import type { MediaDateContext } from "../../media-date-context";
import {
  REVIEWS_TAG,
  DEFAULT_EVENT_HISTORY_DAYS,
  ACTIVITY_LIST_INTENT_EVENT,
  REVIEW_EXPORT_CLOSE_EVENT,
  REVIEW_EXPORT_CONFIRM_EVENT,
  REVIEW_TRACKING_CLOSE_EVENT,
  REVIEW_TRACKING_RETRY_EVENT,
} from "../../../core/constants";
import {
  activityPreviewMediaRequest,
  activityRecordedMediaRequest,
} from "../../../core/activity-media";
import { homeAssistantDateKey } from "../../../core/date-time";
import type {
  HomeAssistantApi,
  HomeAssistantLocale,
} from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import type {
  ActivityListIntent,
  ActivityListItem,
} from "../../../ui/activity-list";
import "../../../ui/activity-list";
import { openRecordedMedia } from "../../../core/recorded-media";
import { ToastManager } from "../../../ui/toast-manager";
import "../../../ui/toast-region";
import { reviewsStyles } from "./reviews.styles";
import type { ReviewAnalysis } from "./review-analysis-dialog";
import type { ReviewExportConfirmation } from "./review-export-dialog";
import "./review-analysis-dialog";
import "./review-export-dialog";
import "./review-tracking-dialog";
import { ReviewDownloadController } from "./review-download.controller";
import { ReviewExportController } from "./review-export.controller";
import { ReviewTrackingController } from "./review-tracking.controller";

const MEDIA_RESOLVE_DELAYS_MS = [0, 750, 1_500] as const;
const activityListIntentEvent = unsafeStatic(ACTIVITY_LIST_INTENT_EVENT);
const reviewExportCloseEvent = unsafeStatic(REVIEW_EXPORT_CLOSE_EVENT);
const reviewExportConfirmEvent = unsafeStatic(REVIEW_EXPORT_CONFIRM_EVENT);
const reviewTrackingCloseEvent = unsafeStatic(REVIEW_TRACKING_CLOSE_EVENT);
const reviewTrackingRetryEvent = unsafeStatic(REVIEW_TRACKING_RETRY_EVENT);

/** Active-camera provider review activity presented as WatchZone Reviews. */
export class ReviewsModule extends LitElement {
  public static properties = {
    api: { attribute: false },
    activityFilter: { attribute: false },
    cameraSelection: { attribute: false },
    displayEventTypeBadges: { attribute: false },
    displayObjectBadges: { attribute: false },
    displayZone: { attribute: false },
    historyDays: { attribute: false },
    hoverPreviewEnabled: { attribute: false, type: Boolean },
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
  public hoverPreviewEnabled = true;
  public localize: LocalizeFunction = englishLocalize;
  public mediaDate?: MediaDateContext;
  public roundedCorners = true;
  public shadows = true;
  public targetModuleId = "";

  private readonly _toasts = new ToastManager(this);
  private _analysis?: ReviewAnalysis;
  private _publishedActivity?: readonly ReviewItem[];
  private _publishedEntityId?: string;
  private _publishedFilter?: ActivityFilterContext;
  private _publishedDateEntityId?: string;
  private _publishedDateContext?: MediaDateContext;
  private readonly _pendingReviewIds = new Set<string>();
  private readonly _filter = new ActivityFilterController(
    this,
    () => this.activityFilter,
    () => this.mediaDate,
    () => this.cameraSelection,
    () => this.targetModuleId,
    () => this.api?.locale,
    "reviews",
  );
  private readonly _activity = new ActiveCameraActivityController<ReviewItem>(
    this,
    () => ({
      api: this.api,
      cameraSelection: this.cameraSelection,
      historyDays: this.historyDays,
      targetModuleId: this.targetModuleId,
    }),
    listReviews,
    () =>
      this._toasts.error(this.localize("reviews.load_failed"), {
        key: "reviews-load-failed",
      }),
    "reviews",
    (notification) => notification.review,
    (state) => state.activeReviews ?? [],
  );
  private readonly _download = new ReviewDownloadController(
    this,
    () => this.api,
    () => this.localize,
    this._toasts,
  );
  private readonly _exports = new ReviewExportController(
    this,
    () => this.api,
    () => this._activity.activeEntityId,
    () => this._activity.activeCameraLabel,
    () => this._activity.items,
    () => this.localize,
    this._toasts,
  );
  private readonly _tracking = new ReviewTrackingController(
    this,
    () => this.api,
    () => this._activity.activeEntityId,
  );

  public disconnectedCallback(): void {
    this._clearPublishedDates();
    super.disconnectedCallback();
  }

  protected update(changed: PropertyValues<this>): void {
    if (changed.has("api")) this._exports.syncApi();
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
      this.activityFilter.publishReviews(
        entityId,
        this._activity.items.map((review) => ({
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
      .filter((review) =>
        this._filter.includesReview({
          classification: review.classification,
          labels: [...review.labels, ...review.sub_labels],
          reviewed: review.reviewed,
          startTime: review.start_time,
          zones: review.zones,
        }),
      )
      .map((review) => this._listItem(review));
    return staticHtml`
      <wzc-activity-list
        .displayObjectBadges=${this.displayObjectBadges}
        .displayTypeBadges=${this.displayEventTypeBadges}
        .displayZone=${this.displayZone}
        .emptyKey=${"reviews.empty"}
        .items=${items}
        .listKey=${"reviews.list"}
        .loading=${this._activity.loading}
        .loadingKey=${"reviews.loading"}
        .locale=${this.api?.locale}
        .localize=${this.localize}
        .resolveUrl=${this.api?.resolveUrl}
        .roundedCorners=${this.roundedCorners}
        .selectedDate=${this._filter.selectedDate()}
        .shadows=${this.shadows}
        @${activityListIntentEvent}=${this._handleActivityIntent}
      ></wzc-activity-list>
      <wzc-review-analysis-dialog
        .analysis=${this._analysis}
        .localize=${this.localize}
        .locale=${this.api?.locale}
        @wzc-review-analysis-close=${this._closeAnalysis}
      ></wzc-review-analysis-dialog>
      <wzc-review-export-dialog
        .draft=${this._exports.pending?.draft}
        .localize=${this.localize}
        .submitting=${false}
        @${reviewExportCloseEvent}=${this._closeExport}
        @${reviewExportConfirmEvent}=${this._confirmExport}
      ></wzc-review-export-dialog>
      <wzc-review-tracking-dialog
        .localize=${this.localize}
        .locale=${this.api?.locale}
        .model=${this._tracking.model}
        @${reviewTrackingCloseEvent}=${this._closeTracking}
        @${reviewTrackingRetryEvent}=${this._retryTracking}
      ></wzc-review-tracking-dialog>
      <wzc-toast-region .notices=${this._toasts.notices}></wzc-toast-region>
    `;
  }

  private _listItem(review: ReviewItem): ActivityListItem {
    return {
      ...(review.analysis_title && review.analysis_description
        ? {
            analysisDescription: review.analysis_description,
            analysisConcerns: review.analysis_concerns,
            ...(review.analysis_score !== null
              ? { analysisScore: review.analysis_score }
              : {}),
            analysisTitle: review.analysis_title,
          }
        : {}),
      cameraLabel: this._activity.activeCameraLabel ?? review.camera,
      classification: review.classification,
      clipUrl: review.clip_url,
      downloadUrl: review.download_url ?? review.clip_url,
      downloadFilename: `${review.camera}-${Math.floor(review.start_time)}.mp4`,
      endTime: review.end_time,
      exportable: true,
      exportPending: this._exports.isPending(review.id),
      ...this._exports.feedback(review.id),
      hoverPreviewUrl: this.hoverPreviewEnabled ? review.preview_url : null,
      id: review.id,
      inProgress:
        review.end_time === null || review.playback_sources.length === 0,
      mediaEndTime: review.media_end_time,
      mediaStartTime: review.media_start_time,
      objectLabels: [...review.labels, ...review.sub_labels],
      playbackSources: review.playback_sources,
      playable: true,
      preferredTransport: review.preferred_transport,
      reviewed: review.reviewed,
      reviewStatePending: this._pendingReviewIds.has(review.id),
      revision: review.revision,
      snapshotUrl: review.snapshot_url,
      startTime: review.start_time,
      thumbnailUrl: review.thumbnail_url,
      trackingAvailable: review.related_event_ids.length > 0,
      typeBadge: {
        label: this.localize(
          review.classification === "alert"
            ? "reviews.alert"
            : "reviews.detection",
        ),
        variant: review.classification === "alert" ? "danger" : "warning",
      },
      zones: review.zones,
    };
  }

  private readonly _openAnalysis = (item: ActivityListItem): void => {
    if (!item.analysisTitle || !item.analysisDescription) return;
    this._analysis = {
      concerns: item.analysisConcerns ?? [],
      description: item.analysisDescription,
      score: item.analysisScore,
      title: item.analysisTitle,
    };
    this.requestUpdate();
  };

  private readonly _handleActivityIntent = (
    event: CustomEvent<ActivityListIntent>,
  ): void => {
    event.stopPropagation();
    const intent = event.detail;
    if (intent.kind === "retry_media") {
      this._activity.retryMedia(intent.item, intent.url);
    } else if (intent.kind === "open_analysis") {
      this._openAnalysis(intent.item);
    } else if (intent.kind === "open_tracking") {
      void this._tracking.open(intent.item);
    } else if (intent.kind === "toggle_reviewed") {
      this._toggleReviewed(intent.item);
    } else if (intent.kind === "export") {
      void this._exports.begin(intent.item);
    } else if (intent.kind === "download") {
      void this._download.download(intent.item);
    } else {
      void this._openMedia(intent.item, intent.media);
    }
  };

  private async _openMedia(
    item: ActivityListItem,
    kind: "snapshot" | "video",
  ): Promise<void> {
    const markReviewedOnOpen = item.inProgress !== true;
    if (kind === "snapshot") {
      const request = activityRecordedMediaRequest(
        item,
        kind,
        "review",
        this.api,
      );
      if (request) openRecordedMedia(this, request);
      return;
    }
    if (item.playbackSources.length > 0) {
      const request = activityRecordedMediaRequest(
        item,
        kind,
        "review",
        this.api,
      );
      if (request) {
        openRecordedMedia(this, request);
        if (markReviewedOnOpen) this._markReviewed(item);
      }
      return;
    }
    const preview = activityPreviewMediaRequest(
      item,
      "review",
      this.api,
      item.hoverPreviewUrl,
    );
    if (preview) {
      openRecordedMedia(this, preview);
      if (markReviewedOnOpen) this._markReviewed(item);
      void this._resolvePlayback(item);
      return;
    }
    const resolved = await this._resolvePlayback(item);
    if (!resolved) return;
    const request = activityRecordedMediaRequest(
      resolved,
      kind,
      "review",
      this.api,
    );
    if (request) {
      openRecordedMedia(this, request);
      if (markReviewedOnOpen) this._markReviewed(resolved);
    }
  }

  private readonly _closeAnalysis = (): void => {
    this._analysis = undefined;
    this.requestUpdate();
  };

  private readonly _closeExport = (): void => this._exports.close();

  private readonly _confirmExport = (
    event: CustomEvent<ReviewExportConfirmation>,
  ): void => this._exports.confirm(event.detail);

  private readonly _closeTracking = (): void => this._tracking.close();

  private readonly _retryTracking = (): void => this._tracking.retry();

  private readonly _toggleReviewed = (item: ActivityListItem): void => {
    if (item.reviewed === undefined) return;
    this._setReviewed(item, !item.reviewed);
  };

  private readonly _markReviewed = (item: ActivityListItem): void => {
    if (item.reviewed === false) this._setReviewed(item, true);
  };

  private _setReviewed(item: ActivityListItem, reviewed: boolean): void {
    const api = this.api;
    const entityId = this._activity.activeEntityId;
    if (
      !api ||
      !entityId ||
      item.reviewed === undefined ||
      item.reviewed === reviewed ||
      this._pendingReviewIds.has(item.id)
    )
      return;
    const previous = item.reviewed;
    this._pendingReviewIds.add(item.id);
    this._activity.updateItem(item.id, (review) => ({ ...review, reviewed }));
    this.requestUpdate();
    void setReviewReviewed(api, entityId, item.id, reviewed)
      .catch(() => {
        this._activity.updateItem(item.id, (review) => ({
          ...review,
          reviewed: previous,
        }));
        this._toasts.error(this.localize("reviews.update_failed"), {
          key: `review-state-${item.id}`,
        });
      })
      .finally(() => {
        this._pendingReviewIds.delete(item.id);
        this.requestUpdate();
      });
  }

  private readonly _resolvePlayback = async (
    item: ActivityListItem,
  ): Promise<ActivityListItem | undefined> => {
    for (const delay of MEDIA_RESOLVE_DELAYS_MS) {
      if (delay > 0) await wait(delay);
      await this._activity.refresh();
      const review = this._activity.items.find(
        (candidate) =>
          candidate.id === item.id && candidate.playback_sources.length > 0,
      );
      if (review) {
        return this._listItem(review);
      }
    }
    this._toasts.warning(this.localize("media_player.load_failed"), {
      key: "alert-recording-preparing",
    });
    return undefined;
  };

  static styles = reviewsStyles;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function activityDates(
  items: readonly ReviewItem[],
  locale: HomeAssistantLocale | undefined,
): readonly string[] {
  return [
    ...new Set(
      items.map(({ start_time }) => homeAssistantDateKey(start_time, locale)),
    ),
  ].sort();
}

if (!customElements.get(REVIEWS_TAG)) {
  customElements.define(REVIEWS_TAG, ReviewsModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [REVIEWS_TAG]: ReviewsModule;
  }
}
