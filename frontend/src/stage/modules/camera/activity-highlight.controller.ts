import type { ReactiveController, ReactiveControllerHost } from "lit";

import { ACTIVITY_UPDATE_SUBSCRIBE_RETRY_MS } from "../../../core/constants";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  subscribeActivityUpdates,
  type ActivityUpdateNotification,
} from "../../../providers/activity-update-resolver";

export type LiveActivityClassification = "alert" | "detection";

interface LiveActivityHighlightContext {
  readonly activeEntityId?: string;
  readonly api?: HomeAssistantApi;
  readonly enabled: boolean;
  readonly entityIds: readonly string[];
}

/** Tracks active Frigate review notifications without waiting for REST convergence. */
export class LiveActivityHighlightController implements ReactiveController {
  public classification?: LiveActivityClassification;

  private readonly _activeReviews = new Map<
    string,
    Map<string, LiveActivityClassification>
  >();
  private _activeEntityId?: string;
  private _connected = false;
  private _entityIdsKey = "";
  private _generation = 0;
  private _identity?: HomeAssistantApi["identity"];
  private _enabled = false;
  private readonly _retryTimers = new Map<string, number>();
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

  private _sync(): void {
    if (!this._connected) return;
    const { activeEntityId, api, enabled, entityIds } = this._context();
    const normalizedEntityIds = [...new Set(entityIds.filter(Boolean))];
    const entityIdsKey = normalizedEntityIds.join("\u0000");
    if (
      api?.identity === this._identity &&
      entityIdsKey === this._entityIdsKey &&
      enabled === this._enabled
    ) {
      if (activeEntityId !== this._activeEntityId) {
        this._activeEntityId = activeEntityId;
        this._publishClassification();
      }
      return;
    }
    this._stop();
    this._identity = api?.identity;
    this._activeEntityId = activeEntityId;
    this._entityIdsKey = entityIdsKey;
    this._enabled = enabled;
    if (!enabled || !api) return;
    const generation = ++this._generation;
    for (const entityId of normalizedEntityIds) {
      this._subscribe(api, entityId, generation);
    }
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
        if (generation !== this._generation || !this._enabled) {
          unsubscribe();
          return;
        }
        this._unsubscribes.set(entityId, unsubscribe);
      })
      .catch(() => {
        if (generation !== this._generation || !this._enabled) {
          return;
        }
        const retryTimer = window.setTimeout(() => {
          this._retryTimers.delete(entityId);
          if (generation === this._generation && this._enabled) {
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
    let reviews = this._activeReviews.get(entityId);
    if (!reviews) {
      reviews = new Map();
      this._activeReviews.set(entityId, reviews);
    }
    if (notification.phase === "end") {
      reviews.delete(notification.id);
    } else if (notification.classification) {
      reviews.set(notification.id, notification.classification);
    }
    if (reviews.size === 0) this._activeReviews.delete(entityId);
    if (entityId === this._activeEntityId) this._publishClassification();
  }

  private _publishClassification(): void {
    const reviews = this._activeEntityId
      ? this._activeReviews.get(this._activeEntityId)
      : undefined;
    const classification = this._activeReviewsHas(reviews, "alert")
      ? "alert"
      : this._activeReviewsHas(reviews, "detection")
        ? "detection"
        : undefined;
    if (classification === this.classification) return;
    this.classification = classification;
    this._host.requestUpdate();
  }

  private _activeReviewsHas(
    reviews: ReadonlyMap<string, LiveActivityClassification> | undefined,
    classification: LiveActivityClassification,
  ) {
    return reviews ? [...reviews.values()].includes(classification) : false;
  }

  private _stop(): void {
    this._generation += 1;
    for (const unsubscribe of this._unsubscribes.values()) unsubscribe();
    this._unsubscribes.clear();
    for (const timer of this._retryTimers.values()) window.clearTimeout(timer);
    this._retryTimers.clear();
    this._activeReviews.clear();
    if (this.classification !== undefined) {
      this.classification = undefined;
      this._host.requestUpdate();
    }
  }
}
