import type { ReactiveController, ReactiveControllerHost } from "lit";

import { ACTIVITY_UPDATE_SUBSCRIBE_RETRY_MS } from "../../../core/constants";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  subscribeActivityUpdates,
  type ActivityUpdateNotification,
} from "../../../providers/activity-update-resolver";

export type LiveActivityClassification = "alert" | "detection";

interface LiveActivityHighlightContext {
  readonly api?: HomeAssistantApi;
  readonly enabled: boolean;
  readonly entityId?: string;
}

/** Tracks active Frigate review notifications without waiting for REST convergence. */
export class LiveActivityHighlightController implements ReactiveController {
  public classification?: LiveActivityClassification;

  private readonly _activeReviews = new Map<
    string,
    LiveActivityClassification
  >();
  private _connected = false;
  private _generation = 0;
  private _identity?: HomeAssistantApi["identity"];
  private _entityId?: string;
  private _enabled = false;
  private _retryTimer?: number;
  private _unsubscribe?: () => void;

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
    const { api, enabled, entityId } = this._context();
    if (
      api?.identity === this._identity &&
      entityId === this._entityId &&
      enabled === this._enabled
    ) {
      return;
    }
    this._stop();
    this._identity = api?.identity;
    this._entityId = entityId;
    this._enabled = enabled;
    if (enabled && api && entityId) this._subscribe(api, entityId);
  }

  private _subscribe(api: HomeAssistantApi, entityId: string): void {
    const generation = ++this._generation;
    void subscribeActivityUpdates(api, entityId, "reviews", (notification) =>
      this._received(generation, entityId, notification),
    )
      .then((unsubscribe) => {
        if (
          generation !== this._generation ||
          entityId !== this._entityId ||
          !this._enabled
        ) {
          unsubscribe();
          return;
        }
        this._unsubscribe = unsubscribe;
      })
      .catch(() => {
        if (
          generation !== this._generation ||
          entityId !== this._entityId ||
          !this._enabled
        ) {
          return;
        }
        this._retryTimer = window.setTimeout(() => {
          this._retryTimer = undefined;
          if (entityId === this._entityId && this._enabled) {
            this._subscribe(api, entityId);
          }
        }, ACTIVITY_UPDATE_SUBSCRIBE_RETRY_MS);
      });
  }

  private _received(
    generation: number,
    entityId: string,
    notification: ActivityUpdateNotification,
  ): void {
    if (
      generation !== this._generation ||
      entityId !== this._entityId ||
      notification.topic !== "reviews" ||
      !notification.id
    ) {
      return;
    }
    if (notification.phase === "end") {
      this._activeReviews.delete(notification.id);
    } else if (notification.classification) {
      this._activeReviews.set(notification.id, notification.classification);
    }
    const classification = this._activeReviewsHas("alert")
      ? "alert"
      : this._activeReviewsHas("detection")
        ? "detection"
        : undefined;
    if (classification === this.classification) return;
    this.classification = classification;
    this._host.requestUpdate();
  }

  private _activeReviewsHas(classification: LiveActivityClassification) {
    return [...this._activeReviews.values()].includes(classification);
  }

  private _stop(): void {
    this._generation += 1;
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    if (this._retryTimer !== undefined) window.clearTimeout(this._retryTimer);
    this._retryTimer = undefined;
    this._activeReviews.clear();
    if (this.classification !== undefined) {
      this.classification = undefined;
      this._host.requestUpdate();
    }
  }
}
