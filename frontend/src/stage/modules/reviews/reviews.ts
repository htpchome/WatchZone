import { html, LitElement, type PropertyValues } from "lit";

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
} from "../../../core/constants";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import type {
  ActivityListItem,
  ActivityPlaybackResolution,
} from "../../../ui/activity-list";
import "../../../ui/activity-list";
import { ToastManager } from "../../../ui/toast-manager";
import "../../../ui/toast-region";
import { reviewsStyles } from "./reviews.styles";
import type { ReviewAnalysis } from "./review-analysis-dialog";
import "./review-analysis-dialog";

const MEDIA_RESOLVE_DELAYS_MS = [0, 750, 1_500] as const;

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
  );

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
    super.update(changed);
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
    return html`
      <wzc-activity-list
        .api=${this.api}
        .displayObjectBadges=${this.displayObjectBadges}
        .displayTypeBadges=${this.displayEventTypeBadges}
        .displayZone=${this.displayZone}
        .emptyKey=${"reviews.empty"}
        .items=${items}
        .listKey=${"reviews.list"}
        .loading=${this._activity.loading}
        .loadingKey=${"reviews.loading"}
        .localize=${this.localize}
        .openAnalysis=${this._openAnalysis}
        .retryMedia=${(item: ActivityListItem, url: string) =>
          this._activity.retryMedia(item, url)}
        .resolvePlayback=${this._resolvePlayback}
        .roundedCorners=${this.roundedCorners}
        .selectedDate=${this._filter.selectedDate()}
        .shadows=${this.shadows}
        .toggleReviewed=${this._toggleReviewed}
      ></wzc-activity-list>
      <wzc-review-analysis-dialog
        .analysis=${this._analysis}
        .localize=${this.localize}
        .locale=${this.api?.locale}
        @wzc-review-analysis-close=${this._closeAnalysis}
      ></wzc-review-analysis-dialog>
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
      endTime: review.end_time,
      hoverPreviewUrl: this.hoverPreviewEnabled ? review.preview_url : null,
      id: review.id,
      inProgress:
        review.end_time === null || review.playback_sources.length === 0,
      mediaEndTime: review.media_end_time,
      mediaStartTime: review.media_start_time,
      objectLabels: [...review.labels, ...review.sub_labels],
      playbackSources: review.playback_sources,
      preferredTransport: review.preferred_transport,
      reviewed: review.reviewed,
      reviewStatePending: this._pendingReviewIds.has(review.id),
      revision: review.revision,
      snapshotUrl: review.snapshot_url,
      startTime: review.start_time,
      thumbnailUrl: review.thumbnail_url,
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

  private readonly _closeAnalysis = (): void => {
    this._analysis = undefined;
    this.requestUpdate();
  };

  private readonly _toggleReviewed = (item: ActivityListItem): void => {
    const api = this.api;
    const entityId = this._activity.activeEntityId;
    if (
      !api ||
      !entityId ||
      item.reviewed === undefined ||
      this._pendingReviewIds.has(item.id)
    )
      return;
    const previous = item.reviewed;
    const reviewed = !previous;
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
  };

  private readonly _resolvePlayback = async (
    item: ActivityListItem,
  ): Promise<ActivityPlaybackResolution | undefined> => {
    for (const delay of MEDIA_RESOLVE_DELAYS_MS) {
      if (delay > 0) await wait(delay);
      await this._activity.refresh();
      const review = this._activity.items.find(
        (candidate) =>
          candidate.id === item.id && candidate.playback_sources.length > 0,
      );
      if (review) {
        return {
          playbackSources: review.playback_sources,
          preferredTransport: review.preferred_transport,
        };
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

if (!customElements.get(REVIEWS_TAG)) {
  customElements.define(REVIEWS_TAG, ReviewsModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [REVIEWS_TAG]: ReviewsModule;
  }
}
