import type { ReactiveController, ReactiveControllerHost } from "lit";

import { listReviewIndex, type ReviewIndexItem } from "../../api/reviews";
import type { HomeAssistantApi } from "../../core/home-assistant";
import type {
  CameraSelectionContext,
  CameraSelectionState,
} from "../camera-selection-context";

interface ActiveCameraReviewIndexContext {
  readonly api?: HomeAssistantApi;
  readonly cameraSelection?: CameraSelectionContext;
  readonly historyDays: number;
  readonly targetModuleId: string;
}

/** Loads lightweight filter and calendar metadata independently of review tiles. */
export class ActiveCameraReviewIndexController implements ReactiveController {
  public items: readonly ReviewIndexItem[] = [];
  public loading = false;

  private _activeScopeKey = "";
  private _connected = false;
  private _generation = 0;
  private _lastApiIdentity?: HomeAssistantApi["identity"];
  private _lastHistoryDays?: number;
  private _subscribedSelection?: CameraSelectionContext;
  private _subscribedTarget = "";
  private _unsubscribe?: () => void;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _context: () => ActiveCameraReviewIndexContext,
    private readonly _onError: () => void,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    this._connected = true;
    this._syncContext();
  }

  public hostDisconnected(): void {
    this._connected = false;
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._subscribedSelection = undefined;
    this._generation += 1;
  }

  public hostUpdate(): void {
    this._syncContext();
  }

  private _syncContext(): void {
    if (!this._connected) return;
    const context = this._context();
    const selectionChanged =
      context.cameraSelection !== this._subscribedSelection ||
      context.targetModuleId !== this._subscribedTarget;
    if (selectionChanged) {
      this._unsubscribe?.();
      this._subscribedSelection = context.cameraSelection;
      this._subscribedTarget = context.targetModuleId;
      this._activeScopeKey = "";
      this.items = [];
      this._generation += 1;
      if (context.cameraSelection && context.targetModuleId) {
        this._unsubscribe = context.cameraSelection.subscribe(
          context.targetModuleId,
          (state) => this._selectionChanged(state),
        );
      }
    }
    const queryChanged =
      context.api?.identity !== this._lastApiIdentity ||
      context.historyDays !== this._lastHistoryDays;
    this._lastApiIdentity = context.api?.identity;
    this._lastHistoryDays = context.historyDays;
    if (!selectionChanged && queryChanged && this._activeScopeKey) {
      void this._load(this._activeScopeKey.split("\u0000"));
    }
  }

  private _selectionChanged(state: CameraSelectionState): void {
    if (state.settled === false) return;
    const entityIds = [
      ...new Set(
        (state.activeEntityIds?.length
          ? state.activeEntityIds
          : state.activeEntityId
            ? [state.activeEntityId]
            : []
        ).filter(Boolean),
      ),
    ];
    const scopeKey = entityIds.join("\u0000");
    if (scopeKey === this._activeScopeKey) return;
    this._activeScopeKey = scopeKey;
    this.items = [];
    this._host.requestUpdate();
    if (entityIds.length > 0) void this._load(entityIds);
  }

  private async _load(entityIds: readonly string[]): Promise<void> {
    const context = this._context();
    const api = context.api;
    const scopeKey = entityIds.join("\u0000");
    if (!api || !scopeKey) return;
    const generation = ++this._generation;
    this.loading = true;
    this._host.requestUpdate();
    try {
      const results = await Promise.allSettled(
        entityIds.map((entityId) =>
          listReviewIndex(api, entityId, context.historyDays),
        ),
      );
      if (results.every(({ status }) => status === "rejected")) {
        this._onError();
        return;
      }
      if (generation !== this._generation || scopeKey !== this._activeScopeKey)
        return;
      const items = new Map<string, ReviewIndexItem>();
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        for (const item of result.value) items.set(item.id, item);
      }
      this.items = [...items.values()].sort(
        (left, right) =>
          right.start_time - left.start_time || left.id.localeCompare(right.id),
      );
    } finally {
      if (generation === this._generation) {
        this.loading = false;
        this._host.requestUpdate();
      }
    }
  }
}
