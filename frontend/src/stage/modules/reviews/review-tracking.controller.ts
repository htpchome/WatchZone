import type { ReactiveController, ReactiveControllerHost } from "lit";

import { getReviewTrackingDetails } from "../../../api/reviews";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import type { ActivityListItem } from "../../../ui/activity-list";
import type { ReviewTrackingDialogModel } from "./review-tracking-dialog";

/** Owns cancellable tracking-detail requests independently of tile rendering. */
export class ReviewTrackingController implements ReactiveController {
  public model?: ReviewTrackingDialogModel;

  private _generation = 0;
  private _reviewId?: string;
  private _sourceItem?: ActivityListItem;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _api: () => HomeAssistantApi | undefined,
    private readonly _entityId: () => string | undefined,
  ) {
    _host.addController(this);
  }

  public hostDisconnected(): void {
    this._generation += 1;
    this._reviewId = undefined;
    this._sourceItem = undefined;
    this.model = undefined;
  }

  public async open(item: ActivityListItem): Promise<void> {
    const api = this._api();
    const entityId = this._entityId();
    if (!api || !entityId || !item.trackingAvailable) return;
    this._reviewId = item.id;
    this._sourceItem = item;
    const generation = ++this._generation;
    this.model = {
      analysisTitle: item.analysisTitle,
      classification: item.classification ?? "detection",
      endTime: item.endTime,
      failed: false,
      loading: true,
      startTime: item.startTime,
    };
    this._host.requestUpdate();
    try {
      const details = await getReviewTrackingDetails(api, entityId, item.id);
      if (!this._isCurrent(generation, item.id)) return;
      this.model = { ...this.model, details, loading: false };
    } catch {
      if (!this._isCurrent(generation, item.id)) return;
      this.model = { ...this.model, failed: true, loading: false };
    }
    this._host.requestUpdate();
  }

  public close(): void {
    this._generation += 1;
    this._reviewId = undefined;
    this._sourceItem = undefined;
    this.model = undefined;
    this._host.requestUpdate();
  }

  public retry(): void {
    if (this._sourceItem) void this.open(this._sourceItem);
  }

  private _isCurrent(generation: number, reviewId: string): boolean {
    return (
      generation === this._generation &&
      this._reviewId === reviewId &&
      this.model !== undefined
    );
  }
}
