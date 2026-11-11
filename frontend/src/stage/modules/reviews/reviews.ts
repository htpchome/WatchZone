import { LitElement, type PropertyValues } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  listReviews,
  setReviewReviewed,
  type ReviewItem,
} from "../../../api/reviews";
import { prepareExport, type ExportRange } from "../../../api/exports";
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
} from "../../../core/constants";
import {
  startExportJob,
  subscribeExportJobs,
  type ExportJob,
} from "../../../features/exports";
import {
  activityPreviewMediaRequest,
  activityRecordedMediaRequest,
} from "../../../core/activity-media";
import type { HomeAssistantApi } from "../../../core/home-assistant";
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
import type {
  ReviewExportConfirmation,
  ReviewExportDraft,
} from "./review-export-dialog";
import "./review-analysis-dialog";
import "./review-export-dialog";

const MEDIA_RESOLVE_DELAYS_MS = [0, 750, 1_500] as const;
const DOWNLOAD_OBJECT_URL_REVOKE_DELAY_MS = 1_000;
const activityListIntentEvent = unsafeStatic(ACTIVITY_LIST_INTENT_EVENT);
const reviewExportCloseEvent = unsafeStatic(REVIEW_EXPORT_CLOSE_EVENT);
const reviewExportConfirmEvent = unsafeStatic(REVIEW_EXPORT_CONFIRM_EVENT);

interface PendingReviewExport {
  readonly draft: ReviewExportDraft;
  readonly range: ExportRange;
  readonly reviewId: string;
}

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
  private _downloadAbort?: AbortController;
  private _exportJobs: readonly ExportJob[] = [];
  private _exportJobsApi?: HomeAssistantApi;
  private _exportJobsUnsubscribe?: () => void;
  private _pendingExport?: PendingReviewExport;
  private readonly _preparingExportIds = new Set<string>();
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

  public connectedCallback(): void {
    super.connectedCallback();
    this._syncExportJobs();
  }

  public disconnectedCallback(): void {
    this._downloadAbort?.abort();
    this._downloadAbort = undefined;
    this._exportJobsUnsubscribe?.();
    this._exportJobsUnsubscribe = undefined;
    this._exportJobsApi = undefined;
    super.disconnectedCallback();
  }

  protected update(changed: PropertyValues<this>): void {
    if (changed.has("api")) this._syncExportJobs();
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
    return staticHtml`
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
        .draft=${this._pendingExport?.draft}
        .localize=${this.localize}
        .submitting=${false}
        @${reviewExportCloseEvent}=${this._closeExport}
        @${reviewExportConfirmEvent}=${this._confirmExport}
      ></wzc-review-export-dialog>
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
      exportPending:
        this._preparingExportIds.has(review.id) ||
        this._exportJob(review.id)?.status === "submitting" ||
        this._exportJob(review.id)?.status === "processing",
      ...this._exportFeedback(review.id),
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
    } else if (intent.kind === "toggle_reviewed") {
      this._toggleReviewed(intent.item);
    } else if (intent.kind === "export") {
      void this._beginExport(intent.item);
    } else if (intent.kind === "download") {
      void this._download(intent.item);
    } else {
      void this._openMedia(intent.item, intent.media);
    }
  };

  private async _download(item: ActivityListItem): Promise<void> {
    const api = this.api;
    const path = item.downloadUrl;
    if (!api || !path) return;
    this._downloadAbort?.abort();
    const abort = new AbortController();
    this._downloadAbort = abort;
    let objectUrl: string | undefined;
    try {
      const signed = await api.callWS<{ readonly path?: string }>({
        type: "auth/sign_path",
        path,
        expires: 3600,
      });
      const response = await fetch(api.resolveUrl(signed.path ?? path), {
        signal: abort.signal,
      });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = item.downloadFilename ?? "review.mp4";
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
      }
    } catch {
      if (abort.signal.aborted) return;
      this._toasts.error(this.localize("reviews.download_failed"), {
        key: `review-download-${item.id}`,
      });
    } finally {
      if (this._downloadAbort === abort) this._downloadAbort = undefined;
      if (objectUrl) {
        const completedUrl = objectUrl;
        window.setTimeout(
          () => URL.revokeObjectURL(completedUrl),
          DOWNLOAD_OBJECT_URL_REVOKE_DELAY_MS,
        );
      }
    }
  }

  private async _openMedia(
    item: ActivityListItem,
    kind: "snapshot" | "video",
  ): Promise<void> {
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
      if (request) openRecordedMedia(this, request);
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
    if (request) openRecordedMedia(this, request);
  }

  private readonly _closeAnalysis = (): void => {
    this._analysis = undefined;
    this.requestUpdate();
  };

  private async _beginExport(item: ActivityListItem): Promise<void> {
    const api = this.api;
    const entityId = this._activity.activeEntityId;
    const startTime = item.mediaStartTime ?? item.startTime;
    const endTime = item.mediaEndTime ?? item.endTime;
    if (
      !api ||
      !entityId ||
      endTime === null ||
      endTime <= startTime ||
      this._preparingExportIds.has(item.id)
    )
      return;
    const range: ExportRange = {
      end_time: endTime,
      entity_id: entityId,
      start_time: startTime,
    };
    this._preparingExportIds.add(item.id);
    this.requestUpdate();
    try {
      const name = await prepareExport(api, range);
      this._pendingExport = { draft: { name }, range, reviewId: item.id };
    } catch {
      this._toasts.error(this.localize("reviews.export_prepare_failed"), {
        key: "review-export-prepare",
      });
    } finally {
      this._preparingExportIds.delete(item.id);
      this.requestUpdate();
    }
  }

  private readonly _closeExport = (): void => {
    this._pendingExport = undefined;
    this.requestUpdate();
  };

  private readonly _confirmExport = (
    event: CustomEvent<ReviewExportConfirmation>,
  ): void => {
    const api = this.api;
    const pending = this._pendingExport;
    if (!api || !pending) return;
    this._pendingExport = undefined;
    this.requestUpdate();
    const review = this._activity.items.find(
      (candidate) => candidate.id === pending.reviewId,
    );
    startExportJob(api, {
      camera: this._activity.activeCameraLabel ?? review?.camera ?? "",
      name: event.detail.name,
      range: pending.range,
      reviewId: pending.reviewId,
    });
  };

  private _syncExportJobs(): void {
    const api = this.api;
    if (api === this._exportJobsApi) return;
    this._exportJobsUnsubscribe?.();
    this._exportJobsUnsubscribe = undefined;
    this._exportJobsApi = api;
    this._exportJobs = [];
    if (!api || !this.isConnected) return;
    this._exportJobsUnsubscribe = subscribeExportJobs(api, (jobs) => {
      this._exportJobs = jobs;
      this.requestUpdate();
    });
  }

  private _exportJob(reviewId: string): ExportJob | undefined {
    const entityId = this._activity.activeEntityId;
    return this._exportJobs.find(
      (job) => job.reviewId === reviewId && job.entityId === entityId,
    );
  }

  private _exportFeedback(reviewId: string): Partial<ActivityListItem> {
    const status = this._exportJob(reviewId)?.status;
    if (status === "submitting" || status === "processing") {
      return {
        exportStatus: "progress",
        exportStatusText: this.localize("reviews.export_progress"),
      };
    }
    if (status === "success") {
      return {
        exportStatus: "success",
        exportStatusText: this.localize("reviews.export_complete"),
      };
    }
    if (status === "failed") {
      return {
        exportStatus: "failed",
        exportStatusText: this.localize("reviews.export_failed_status"),
      };
    }
    return {};
  }

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

if (!customElements.get(REVIEWS_TAG)) {
  customElements.define(REVIEWS_TAG, ReviewsModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [REVIEWS_TAG]: ReviewsModule;
  }
}
