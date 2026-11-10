import { html, LitElement, type PropertyValues } from "lit";

import { listReviews, type ReviewItem } from "../../../api/reviews";
import {
  ActiveCameraActivityController,
  ActivityFilterController,
  type ActivityFilterContext,
} from "../../activity";
import type { CameraSelectionContext } from "../../camera-selection-context";
import {
  ALERTS_TAG,
  DEFAULT_EVENT_HISTORY_DAYS,
} from "../../../core/constants";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import type { ActivityListItem } from "../../../ui/activity-list";
import "../../../ui/activity-list";
import { ToastManager } from "../../../ui/toast-manager";
import "../../../ui/toast-region";
import { alertsStyles } from "./alerts.styles";

/** Active-camera Frigate review activity presented as WatchZone Alerts. */
export class AlertsModule extends LitElement {
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
  public roundedCorners = true;
  public shadows = true;
  public targetModuleId = "";

  private readonly _toasts = new ToastManager(this);
  private _publishedActivity?: readonly ReviewItem[];
  private _publishedEntityId?: string;
  private _publishedFilter?: ActivityFilterContext;
  private readonly _filter = new ActivityFilterController(
    this,
    () => this.activityFilter,
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
      this._toasts.error(this.localize("alerts.load_failed"), {
        key: "alerts-load-failed",
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
      .map((review): ActivityListItem => ({
        cameraLabel: this._activity.activeCameraLabel ?? review.camera,
        classification: review.classification,
        clipUrl: review.clip_url,
        endTime: review.end_time,
        hoverPreviewUrl: this.hoverPreviewEnabled ? review.preview_url : null,
        id: review.id,
        mediaEndTime: review.media_end_time,
        mediaStartTime: review.media_start_time,
        objectLabels: [...review.labels, ...review.sub_labels],
        playbackSources: review.playback_sources,
        preferredTransport: review.preferred_transport,
        revision: review.revision,
        snapshotUrl: review.snapshot_url,
        startTime: review.start_time,
        thumbnailUrl: review.thumbnail_url,
        typeBadge: {
          label: this.localize(
            review.classification === "alert"
              ? "alerts.alert"
              : "alerts.detection",
          ),
          variant: review.classification === "alert" ? "danger" : "warning",
        },
        zones: review.zones,
      }));
    return html`
      <wzc-activity-list
        .api=${this.api}
        .displayObjectBadges=${this.displayObjectBadges}
        .displayTypeBadges=${this.displayEventTypeBadges}
        .displayZone=${this.displayZone}
        .emptyKey=${"alerts.empty"}
        .items=${items}
        .listKey=${"alerts.list"}
        .loading=${this._activity.loading}
        .loadingKey=${"alerts.loading"}
        .localize=${this.localize}
        .retryMedia=${(item: ActivityListItem, url: string) =>
          this._activity.retryMedia(item, url)}
        .roundedCorners=${this.roundedCorners}
        .shadows=${this.shadows}
      ></wzc-activity-list>
      <wzc-toast-region .notices=${this._toasts.notices}></wzc-toast-region>
    `;
  }

  static styles = alertsStyles;
}

if (!customElements.get(ALERTS_TAG)) {
  customElements.define(ALERTS_TAG, AlertsModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [ALERTS_TAG]: AlertsModule;
  }
}
