import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { AlertTakeoverMode } from "../../../core/config";
import {
  ACTIVITY_FALLBACK_RECONCILE_INTERVAL_MS,
  ACTIVITY_UPDATE_SUBSCRIBE_RETRY_MS,
} from "../../../core/constants";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import type { ReviewItem } from "../../../api/reviews";
import { listRecentReviewStates } from "../../../api/reviews";
import {
  subscribeActivityUpdates,
  type ActivityUpdateNotification,
} from "../../../providers/activity-update-resolver";

export type LiveActivityClassification = "alert" | "detection";

interface LiveActivityHighlightContext {
  readonly activeEntityId?: string;
  readonly api?: HomeAssistantApi;
  readonly entityIds: readonly string[];
  readonly highlightEnabled: boolean;
  readonly onTakeover: (entityId: string) => void;
  readonly onTakeoverEnd?: (returnEntityId: string | undefined) => boolean;
  readonly startTakeoverEnabled: boolean;
  readonly takeoverMode: AlertTakeoverMode;
}

interface ActiveReview {
  classification: LiveActivityClassification;
  readonly entityId: string;
  readonly id: string;
  readonly order: number;
  review?: ReviewItem;
}

/** Owns live review activity state, camera highlighting, and takeover order. */
export class LiveActivityHighlightController implements ReactiveController {
  public classification?: LiveActivityClassification;
  public classifications: ReadonlyMap<string, LiveActivityClassification> =
    new Map();
  public takeoverEnabled = false;

  private readonly _activeReviews = new Map<
    string,
    Map<string, ActiveReview>
  >();
  private readonly _endedReviews = new Map<string, Set<string>>();
  private _activeEntityId?: string;
  private _connected = false;
  private _currentTakeover?: ActiveReview;
  private _entityIdsKey = "";
  private _generation = 0;
  private _highlightEnabled = false;
  private _identity?: HomeAssistantApi["identity"];
  private _order = 0;
  private _reconcileInFlight = false;
  private _reconcileRequest = 0;
  private _reconcileTimer?: number;
  private _returnEntityId?: string;
  private _returnCameraPinned = false;
  private readonly _retryTimers = new Map<string, number>();
  private _startTakeoverEnabled = false;
  private _subscriptionEnabled = false;
  private readonly _suppressedReviews = new Set<string>();
  private _takeoverMode: AlertTakeoverMode = "both";
  private readonly _unsubscribes = new Map<string, () => void>();

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _context: () => LiveActivityHighlightContext,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    this._connected = true;
    this._sync();
  }

  public hostUpdate(): void {
    this._sync();
  }

  public hostDisconnected(): void {
    this._connected = false;
    this._stop();
  }

  public toggleTakeover(): void {
    if (this._takeoverMode === "off") return;
    if (this.takeoverEnabled) {
      this.takeoverEnabled = false;
      this._cancelTakeover(true);
    } else {
      this.takeoverEnabled = true;
      this._suppressedReviews.clear();
      this._beginTakeover(this._nextEligibleReview());
    }
    this._host.requestUpdate();
  }

  /** Active normalized Review drafts for the owning camera selection channel. */
  public reviewsFor(entityId: string | undefined): readonly ReviewItem[] {
    if (!entityId) return [];
    return [...(this._activeReviews.get(entityId)?.values() ?? [])]
      .map(({ review }) => review)
      .filter((review): review is ReviewItem => review !== undefined)
      .sort(
        (left, right) =>
          right.start_time - left.start_time || left.id.localeCompare(right.id),
      );
  }

  /** A direct user choice cancels only the current takeover, not the feature. */
  public userSelected(entityId: string): void {
    if (!this._currentTakeover) return;
    this._returnEntityId = entityId;
    this._returnCameraPinned = true;
    this._suppressCurrentReviews();
    this._currentTakeover = undefined;
    this._host.requestUpdate();
  }

  private _sync(): void {
    if (!this._connected) return;
    const context = this._context();
    const normalizedEntityIds = [...new Set(context.entityIds.filter(Boolean))];
    const entityIdsKey = normalizedEntityIds.join("\u0000");
    const takeoverConfigChanged =
      context.takeoverMode !== this._takeoverMode ||
      context.startTakeoverEnabled !== this._startTakeoverEnabled;
    if (takeoverConfigChanged) this._configureTakeover(context);
    this._highlightEnabled = context.highlightEnabled;
    // Navigation indicators remain live even when outline and takeover are off.
    const subscriptionEnabled = normalizedEntityIds.length > 0;
    if (
      context.api?.identity === this._identity &&
      entityIdsKey === this._entityIdsKey &&
      subscriptionEnabled === this._subscriptionEnabled
    ) {
      if (context.activeEntityId !== this._activeEntityId) {
        this._activeEntityId = context.activeEntityId;
        this._publishActivity();
      }
      return;
    }
    this._stopSubscriptions();
    this._cancelTakeover(true);
    this._clearActivity();
    this._identity = context.api?.identity;
    this._activeEntityId = context.activeEntityId;
    this._entityIdsKey = entityIdsKey;
    this._subscriptionEnabled = subscriptionEnabled;
    if (!subscriptionEnabled || !context.api) {
      this._clearActivity();
      return;
    }
    const generation = ++this._generation;
    for (const entityId of normalizedEntityIds) {
      this._subscribe(context.api, entityId, generation);
    }
  }

  private _configureTakeover(context: LiveActivityHighlightContext): void {
    this._cancelTakeover(true);
    this._takeoverMode = context.takeoverMode;
    this._startTakeoverEnabled = context.startTakeoverEnabled;
    this.takeoverEnabled =
      context.takeoverMode !== "off" && context.startTakeoverEnabled;
    this._suppressedReviews.clear();
    if (this.takeoverEnabled) this._beginTakeover(this._nextEligibleReview());
    this._host.requestUpdate();
  }

  private _subscribe(
    api: HomeAssistantApi,
    entityId: string,
    generation: number,
  ): void {
    void subscribeActivityUpdates(api, entityId, "reviews", (notification) =>
      this._received(generation, entityId, notification),
    )
      .then((unsubscribe) => {
        if (generation !== this._generation) {
          unsubscribe();
          return;
        }
        this._unsubscribes.set(entityId, unsubscribe);
      })
      .catch(() => {
        if (generation !== this._generation) return;
        this._activeReviews.delete(entityId);
        this._publishActivity();
        const retryTimer = window.setTimeout(() => {
          this._retryTimers.delete(entityId);
          if (generation === this._generation) {
            this._subscribe(api, entityId, generation);
          }
        }, ACTIVITY_UPDATE_SUBSCRIBE_RETRY_MS);
        this._retryTimers.set(entityId, retryTimer);
      });
  }

  private _received(
    generation: number,
    entityId: string,
    notification: ActivityUpdateNotification,
  ): void {
    if (
      generation !== this._generation ||
      notification.topic !== "reviews" ||
      !notification.id
    ) {
      return;
    }
    const key = reviewKey(entityId, notification.id);
    let reviews = this._activeReviews.get(entityId);
    if (!reviews) {
      reviews = new Map();
      this._activeReviews.set(entityId, reviews);
    }
    if (notification.phase === "end") {
      this._endReviews([{ entityId, id: notification.id }]);
      return;
    }
    if (
      !notification.classification ||
      this._endedReviews.get(entityId)?.has(notification.id)
    ) {
      return;
    }
    const existing = reviews.get(notification.id);
    const review: ActiveReview = existing ?? {
      classification: notification.classification,
      entityId,
      id: notification.id,
      order: ++this._order,
    };
    review.classification = notification.classification;
    if (notification.review) review.review = notification.review;
    reviews.set(notification.id, review);
    this._syncReconciliation();
    if (
      this.takeoverEnabled &&
      !this._currentTakeover &&
      !this._suppressedReviews.has(key) &&
      this._isEligible(review.classification)
    ) {
      this._beginTakeover(review);
    }
    this._publishActivity();
  }

  private _beginTakeover(
    review: ActiveReview | undefined,
    preserveReturnCamera = false,
  ): void {
    if (!review || !this.takeoverEnabled) return;
    if (
      !this._currentTakeover &&
      !preserveReturnCamera &&
      !this._returnCameraPinned
    ) {
      this._returnEntityId = this._activeEntityId;
    }
    this._returnCameraPinned = false;
    this._currentTakeover = review;
    this._context().onTakeover(review.entityId);
  }

  private _nextEligibleReview(): ActiveReview | undefined {
    return [...this._activeReviews.entries()]
      .flatMap(([entityId, reviews]) =>
        [...reviews.values()].filter(
          (review) =>
            this._isEligible(review.classification) &&
            !this._suppressedReviews.has(reviewKey(entityId, review.id)),
        ),
      )
      .sort((left, right) => left.order - right.order)[0];
  }

  private _isEligible(classification: LiveActivityClassification): boolean {
    return (
      this._takeoverMode === "both" ||
      (this._takeoverMode === "alerts" && classification === "alert") ||
      (this._takeoverMode === "detections" && classification === "detection")
    );
  }

  private _cancelTakeover(restore: boolean): void {
    if (!this._currentTakeover) return;
    this._suppressCurrentReviews();
    this._currentTakeover = undefined;
    if (restore) this._restoreUserCamera();
  }

  private _restoreUserCamera(): void {
    const entityId = this._returnEntityId;
    this._returnEntityId = undefined;
    this._returnCameraPinned = false;
    if (this._context().onTakeoverEnd?.(entityId)) return;
    if (entityId) this._context().onTakeover(entityId);
  }

  private _suppressCurrentReviews(): void {
    for (const [entityId, reviews] of this._activeReviews) {
      for (const review of reviews.values()) {
        this._suppressedReviews.add(reviewKey(entityId, review.id));
      }
    }
  }

  private _rememberEnded(entityId: string, reviewId: string): void {
    const ended = this._endedReviews.get(entityId) ?? new Set<string>();
    ended.add(reviewId);
    while (ended.size > 100) {
      const oldest = ended.values().next().value;
      if (oldest === undefined) break;
      ended.delete(oldest);
    }
    this._endedReviews.set(entityId, ended);
  }

  private _endReviews(
    endedReviews: readonly { readonly entityId: string; readonly id: string }[],
  ): void {
    let changed = false;
    let currentEnded = false;
    for (const { entityId, id } of endedReviews) {
      const reviews = this._activeReviews.get(entityId);
      const ended = reviews?.get(id);
      if (ended) {
        reviews?.delete(id);
        changed = true;
      }
      this._suppressedReviews.delete(reviewKey(entityId, id));
      this._rememberEnded(entityId, id);
      if (reviews?.size === 0) this._activeReviews.delete(entityId);
      if (
        ended &&
        this._currentTakeover?.entityId === entityId &&
        this._currentTakeover.id === id
      ) {
        currentEnded = true;
      }
    }
    if (currentEnded) {
      this._currentTakeover = undefined;
      const next = this._nextEligibleReview();
      if (next) this._beginTakeover(next, true);
      else this._restoreUserCamera();
    }
    this._syncReconciliation();
    if (changed) this._publishActivity();
  }

  private _syncReconciliation(): void {
    const shouldReconcile = this._connected && this._activeReviews.size > 0;
    if (!shouldReconcile) {
      if (this._reconcileTimer !== undefined) {
        window.clearInterval(this._reconcileTimer);
        this._reconcileTimer = undefined;
      }
      return;
    }
    this._reconcileTimer ??= window.setInterval(
      () => void this._reconcileActivity(),
      ACTIVITY_FALLBACK_RECONCILE_INTERVAL_MS,
    );
  }

  private async _reconcileActivity(): Promise<void> {
    if (this._reconcileInFlight) return;
    const api = this._context().api;
    if (!api || this._activeReviews.size === 0) return;
    const generation = this._generation;
    const request = ++this._reconcileRequest;
    const activeByEntity = [...this._activeReviews.entries()]
      .map(([entityId, reviews]) => ({
        entityId,
        reviews: [...reviews.values()],
      }))
      .filter(({ reviews }) => reviews.some(({ review }) => review));
    if (activeByEntity.length === 0) return;
    this._reconcileInFlight = true;
    try {
      const results = await Promise.allSettled(
        activeByEntity.map(({ entityId }) =>
          listRecentReviewStates(api, entityId),
        ),
      );
      if (generation !== this._generation || !this._connected) return;
      const ended: { entityId: string; id: string }[] = [];
      results.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        const local = activeByEntity[index];
        if (!local) return;
        const endedIds = new Set(
          result.value
            .filter(({ end_time }) => end_time !== null)
            .map(({ id }) => id),
        );
        for (const review of local.reviews) {
          if (review.review && endedIds.has(review.review.id)) {
            ended.push({ entityId: local.entityId, id: review.id });
          }
        }
      });
      if (ended.length > 0) this._endReviews(ended);
    } finally {
      if (request === this._reconcileRequest) {
        this._reconcileInFlight = false;
      }
    }
  }

  private _publishActivity(): void {
    const nextClassifications = new Map<string, LiveActivityClassification>();
    for (const [entityId, reviews] of this._activeReviews) {
      if (hasClassification(reviews, "alert")) {
        nextClassifications.set(entityId, "alert");
      } else if (hasClassification(reviews, "detection")) {
        nextClassifications.set(entityId, "detection");
      }
    }
    this.classifications = nextClassifications;
    this.classification =
      this._highlightEnabled && this._activeEntityId
        ? nextClassifications.get(this._activeEntityId)
        : undefined;
    this._host.requestUpdate();
  }

  private _clearActivity(): void {
    if (this._reconcileTimer !== undefined) {
      window.clearInterval(this._reconcileTimer);
      this._reconcileTimer = undefined;
    }
    this._reconcileRequest += 1;
    this._reconcileInFlight = false;
    this._activeReviews.clear();
    this._endedReviews.clear();
    this._suppressedReviews.clear();
    this._currentTakeover = undefined;
    this._returnEntityId = undefined;
    this._returnCameraPinned = false;
    this.classifications = new Map();
    this.classification = undefined;
    this._host.requestUpdate();
  }

  private _stopSubscriptions(): void {
    this._generation += 1;
    for (const unsubscribe of this._unsubscribes.values()) unsubscribe();
    this._unsubscribes.clear();
    for (const timer of this._retryTimers.values()) window.clearTimeout(timer);
    this._retryTimers.clear();
    this._subscriptionEnabled = false;
  }

  private _stop(): void {
    this._stopSubscriptions();
    this._clearActivity();
  }
}

function hasClassification(
  reviews: ReadonlyMap<string, ActiveReview>,
  classification: LiveActivityClassification,
): boolean {
  return [...reviews.values()].some(
    (review) => review.classification === classification,
  );
}

function reviewKey(entityId: string, reviewId: string): string {
  return `${entityId}\u0000${reviewId}`;
}
