import type { ReactiveController, ReactiveControllerHost } from "lit";

import { ACTIVITY_UPDATE_SUBSCRIBE_RETRY_MS } from "../../core/constants";
import {
  activityClassificationModeIncludes,
  type ActivityHighlightMode,
} from "../../core/config";
import type { HomeAssistantApi } from "../../core/home-assistant";
import { subscribeActivityUpdates } from "../../api/activity-updates";

export type CameraActivityClassification = "alert" | "detection";

/** Lightweight one-camera activity outline; owns no takeover or navigation. */
export class CameraActivityHighlightController implements ReactiveController {
  public classification?: CameraActivityClassification;

  private _api?: HomeAssistantApi;
  private _connected = false;
  private _entityId?: string;
  private _generation = 0;
  private _highlightMode: ActivityHighlightMode = "both";
  private readonly _reviews = new Map<string, CameraActivityClassification>();
  private _retryTimer?: number;
  private _unsubscribe?: () => void;

  public constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  public configure(
    api: HomeAssistantApi | undefined,
    entityId: string | undefined,
    highlightMode: ActivityHighlightMode,
  ): void {
    const enabled = highlightMode !== "off";
    const nextApi = enabled ? api : undefined;
    const nextEntityId = enabled ? entityId : undefined;
    if (
      this._api?.identity === nextApi?.identity &&
      this._entityId === nextEntityId
    ) {
      if (this._highlightMode !== highlightMode) {
        this._highlightMode = highlightMode;
        this._publish();
      }
      return;
    }
    this._stopSubscription();
    this._clearActivity();
    this._api = nextApi;
    this._entityId = nextEntityId;
    this._highlightMode = highlightMode;
    if (this._connected) this._start();
  }

  public hostConnected(): void {
    this._connected = true;
    this._start();
  }

  public hostDisconnected(): void {
    this._connected = false;
    this._stopSubscription();
  }

  private _start(): void {
    if (!this._api || !this._entityId) return;
    const generation = ++this._generation;
    void subscribeActivityUpdates(
      this._api,
      this._entityId,
      "reviews",
      (notification) => {
        if (generation !== this._generation || !notification.id) return;
        if (notification.phase === "end") {
          this._reviews.delete(notification.id);
        } else if (notification.classification) {
          this._reviews.set(notification.id, notification.classification);
        }
        this._publish();
      },
    )
      .then((unsubscribe) => {
        if (generation !== this._generation) unsubscribe();
        else this._unsubscribe = unsubscribe;
      })
      .catch(() => {
        if (generation !== this._generation || !this._connected) return;
        this._retryTimer = window.setTimeout(
          () => this._start(),
          ACTIVITY_UPDATE_SUBSCRIBE_RETRY_MS,
        );
      });
  }

  private _publish(): void {
    const values = [...this._reviews.values()].filter((classification) =>
      activityClassificationModeIncludes(this._highlightMode, classification),
    );
    const next = values.includes("alert")
      ? "alert"
      : values.includes("detection")
        ? "detection"
        : undefined;
    if (next === this.classification) return;
    this.classification = next;
    this._host.requestUpdate();
  }

  private _stopSubscription(): void {
    this._generation += 1;
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    if (this._retryTimer !== undefined) window.clearTimeout(this._retryTimer);
    this._retryTimer = undefined;
  }

  private _clearActivity(): void {
    this._reviews.clear();
    this.classification = undefined;
  }
}
