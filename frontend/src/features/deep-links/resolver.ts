import type { EventItem } from "../../api/events";
import type { ReviewItem } from "../../api/reviews";
import {
  ACTIVITY_FALLBACK_RECONCILE_INTERVAL_MS,
  ACTIVITY_UPDATE_SUBSCRIBE_RETRY_MS,
  ACTIVITY_UPDATE_RECONCILE_DELAYS_MS,
} from "../../core/constants";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../../core/home-assistant";
import type { RecordedMediaRequest } from "../../core/recorded-media";
import { subscribeActivityUpdates } from "../../providers/activity-update-resolver";
import { activityRecordedMediaRequest } from "../../ui/activity-media";
import { findEvent, findReview } from "./activity-lookup";

interface ActivityDeepLinkResolverOptions {
  readonly api: HomeAssistantApi;
  readonly cameraEntityId: string;
  readonly eventId?: string;
  readonly historyDays: number;
  readonly media: "snapshot" | "video";
  readonly onOpen: (request: RecordedMediaRequest) => void;
  readonly reviewId?: string;
}

/** One-way event-to-review resolver that remains live for draft activity. */
export class ActivityDeepLinkResolver {
  private _active = false;
  private _phase: "events" | "reviews";
  private _refreshAgain = false;
  private _refreshing = false;
  private _refreshTimer?: number;
  private readonly _reconcileTimers = new Set<number>();
  private _subscribeRetryTimer?: number;
  private _unsubscribe?: HomeAssistantUnsubscribe;

  public constructor(
    private readonly _options: ActivityDeepLinkResolverOptions,
  ) {
    this._phase = _options.eventId ? "events" : "reviews";
  }

  public start(): void {
    if (this._active) return;
    this._active = true;
    void this._subscribe();
    void this._refresh();
    this._refreshTimer = window.setInterval(
      () => void this._refresh(),
      ACTIVITY_FALLBACK_RECONCILE_INTERVAL_MS,
    );
  }

  public stop(): void {
    this._active = false;
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    if (this._refreshTimer !== undefined)
      window.clearInterval(this._refreshTimer);
    this._refreshTimer = undefined;
    if (this._subscribeRetryTimer !== undefined)
      window.clearTimeout(this._subscribeRetryTimer);
    this._subscribeRetryTimer = undefined;
    for (const timer of this._reconcileTimers) window.clearTimeout(timer);
    this._reconcileTimers.clear();
  }

  private async _subscribe(): Promise<void> {
    try {
      const unsubscribe = await subscribeActivityUpdates(
        this._options.api,
        this._options.cameraEntityId,
        "reviews",
        () => {
          void this._refresh();
          if (this._reconcileTimers.size > 0) return;
          for (const delay of ACTIVITY_UPDATE_RECONCILE_DELAYS_MS) {
            const timer = window.setTimeout(() => {
              this._reconcileTimers.delete(timer);
              void this._refresh();
            }, delay);
            this._reconcileTimers.add(timer);
          }
        },
      );
      if (!this._active) unsubscribe();
      else this._unsubscribe = unsubscribe;
    } catch {
      if (!this._active || this._subscribeRetryTimer !== undefined) return;
      this._subscribeRetryTimer = window.setTimeout(() => {
        this._subscribeRetryTimer = undefined;
        void this._subscribe();
      }, ACTIVITY_UPDATE_SUBSCRIBE_RETRY_MS);
    }
  }

  private async _refresh(): Promise<void> {
    if (!this._active) return;
    if (this._refreshing) {
      this._refreshAgain = true;
      return;
    }
    this._refreshing = true;
    try {
      if (this._phase === "events") {
        const event = await this._event();
        const request = event ? this._eventRequest(event) : undefined;
        if (request) {
          this._open(request);
          return;
        }
        if (this._options.reviewId) this._phase = "reviews";
      }
      if (this._phase === "reviews") {
        const review = await this._review();
        const request = review ? this._reviewRequest(review) : undefined;
        if (request) this._open(request);
      }
    } catch {
      if (this._phase === "events" && this._options.reviewId) {
        this._phase = "reviews";
        this._refreshAgain = true;
      }
    } finally {
      this._refreshing = false;
      if (this._active && this._refreshAgain) {
        this._refreshAgain = false;
        void this._refresh();
      }
    }
  }

  private async _event(): Promise<EventItem | undefined> {
    const eventId = this._options.eventId;
    if (!eventId) return undefined;
    return findEvent(
      this._options.api,
      this._options.cameraEntityId,
      eventId,
      this._options.historyDays,
    );
  }

  private async _review(): Promise<ReviewItem | undefined> {
    const reviewId = this._options.reviewId;
    if (!reviewId) return undefined;
    return findReview(
      this._options.api,
      this._options.cameraEntityId,
      reviewId,
      this._options.historyDays,
    );
  }

  private _eventRequest(event: EventItem): RecordedMediaRequest | undefined {
    return activityRecordedMediaRequest(
      {
        cameraLabel: event.camera,
        id: event.id,
        playbackSources: event.playback_sources,
        preferredTransport: event.preferred_transport,
        snapshotUrl: event.snapshot_url,
        startTime: event.start_time,
        thumbnailUrl: event.thumbnail_url,
      },
      this._options.media,
      this._options.api,
    );
  }

  private _reviewRequest(review: ReviewItem): RecordedMediaRequest | undefined {
    return activityRecordedMediaRequest(
      {
        cameraLabel: review.camera,
        id: review.id,
        playbackSources: review.playback_sources,
        preferredTransport: review.preferred_transport,
        snapshotUrl: review.snapshot_url,
        startTime: review.start_time,
        thumbnailUrl: review.thumbnail_url,
      },
      this._options.media,
      this._options.api,
    );
  }

  private _open(request: RecordedMediaRequest): void {
    if (!this._active) return;
    this.stop();
    this._options.onOpen(request);
  }
}
