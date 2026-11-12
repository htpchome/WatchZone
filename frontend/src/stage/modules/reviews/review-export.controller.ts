import type { ReactiveController, ReactiveControllerHost } from "lit";

import { prepareExport, type ExportRange } from "../../../api/exports";
import type { ReviewItem } from "../../../api/reviews";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import type { LocalizeFunction } from "../../../core/localization";
import {
  startExportJob,
  subscribeExportJobs,
  type ExportJob,
} from "../../../features/exports";
import type { ActivityListItem } from "../../../ui/activity-list";
import type { ToastManager } from "../../../ui/toast-manager";
import type {
  ReviewExportConfirmation,
  ReviewExportDraft,
} from "./review-export-dialog";

interface PendingReviewExport {
  readonly draft: ReviewExportDraft;
  readonly range: ExportRange;
  readonly reviewId: string;
}

/** Owns review export preparation and the shared export-job subscription. */
export class ReviewExportController implements ReactiveController {
  public pending?: PendingReviewExport;
  private _jobs: readonly ExportJob[] = [];
  private _subscribedApi?: HomeAssistantApi;
  private _unsubscribe?: () => void;
  private readonly _preparingIds = new Set<string>();

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _api: () => HomeAssistantApi | undefined,
    private readonly _entityId: () => string | undefined,
    private readonly _cameraLabel: () => string | undefined,
    private readonly _items: () => readonly ReviewItem[],
    private readonly _localize: () => LocalizeFunction,
    private readonly _toasts: ToastManager,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    this.syncApi();
  }

  public hostDisconnected(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._subscribedApi = undefined;
  }

  public syncApi(): void {
    const api = this._api();
    if (api === this._subscribedApi) return;
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._subscribedApi = api;
    this._jobs = [];
    if (!api) return;
    this._unsubscribe = subscribeExportJobs(api, (jobs) => {
      this._jobs = jobs;
      this._host.requestUpdate();
    });
  }

  public async begin(item: ActivityListItem): Promise<void> {
    const api = this._api();
    const entityId = this._entityId();
    const startTime = item.mediaStartTime ?? item.startTime;
    const endTime = item.mediaEndTime ?? item.endTime;
    if (
      !api ||
      !entityId ||
      endTime === null ||
      endTime <= startTime ||
      this._preparingIds.has(item.id)
    )
      return;
    const range: ExportRange = {
      end_time: endTime,
      entity_id: entityId,
      start_time: startTime,
    };
    this._preparingIds.add(item.id);
    this._host.requestUpdate();
    try {
      this.pending = {
        draft: { name: await prepareExport(api, range) },
        range,
        reviewId: item.id,
      };
    } catch {
      this._toasts.error(this._localize()("reviews.export_prepare_failed"), {
        key: "review-export-prepare",
      });
    } finally {
      this._preparingIds.delete(item.id);
      this._host.requestUpdate();
    }
  }

  public close(): void {
    this.pending = undefined;
    this._host.requestUpdate();
  }

  public confirm(detail: ReviewExportConfirmation): void {
    const api = this._api();
    const pending = this.pending;
    if (!api || !pending) return;
    this.pending = undefined;
    this._host.requestUpdate();
    const review = this._items().find(
      (candidate) => candidate.id === pending.reviewId,
    );
    startExportJob(api, {
      camera: this._cameraLabel() ?? review?.camera ?? "",
      name: detail.name,
      range: pending.range,
      reviewId: pending.reviewId,
    });
  }

  public isPending(reviewId: string): boolean {
    const status = this._job(reviewId)?.status;
    return (
      this._preparingIds.has(reviewId) ||
      status === "submitting" ||
      status === "processing"
    );
  }

  public feedback(reviewId: string): Partial<ActivityListItem> {
    const status = this._job(reviewId)?.status;
    if (status === "submitting" || status === "processing") {
      return {
        exportStatus: "progress",
        exportStatusText: this._localize()("reviews.export_progress"),
      };
    }
    if (status === "success") {
      return {
        exportStatus: "success",
        exportStatusText: this._localize()("reviews.export_complete"),
      };
    }
    if (status === "failed") {
      return {
        exportStatus: "failed",
        exportStatusText: this._localize()("reviews.export_failed_status"),
      };
    }
    return {};
  }

  private _job(reviewId: string): ExportJob | undefined {
    const entityId = this._entityId();
    return this._jobs.find(
      (job) => job.reviewId === reviewId && job.entityId === entityId,
    );
  }
}
