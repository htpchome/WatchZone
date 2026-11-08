import type { ReactiveController, ReactiveControllerHost } from "lit";

import type {
  CameraSelectionContext,
  CameraSelectionState,
} from "./camera-selection-context";
import { EVENTS_REFRESH_INTERVAL_MS } from "./constants";
import type { HomeAssistantApi } from "./home-assistant";

export interface ActiveCameraActivityItem {
  readonly id: string;
  readonly revision: string;
}

interface ActiveCameraActivityContext {
  readonly api?: HomeAssistantApi;
  readonly cameraSelection?: CameraSelectionContext;
  readonly historyDays: number;
  readonly targetModuleId: string;
}

type ActivityFetcher<T extends ActiveCameraActivityItem> = (
  api: HomeAssistantApi,
  entityId: string,
  options: { readonly bypassCache: boolean; readonly historyDays: number },
) => Promise<readonly T[]>;

/** Owns the shared camera-scoped polling lifecycle for activity modules. */
export class ActiveCameraActivityController<
  T extends ActiveCameraActivityItem,
> implements ReactiveController {
  public items: readonly T[] = [];
  public loading = false;

  private _activeEntityId?: string;
  private _activeCameraLabel?: string;
  private _connected = false;
  private _generation = 0;
  private _refreshTimer?: number;
  private readonly _retriedMedia = new Set<string>();
  private _subscribedSelection?: CameraSelectionContext;
  private _subscribedTarget = "";
  private _unsubscribe?: () => void;
  private _lastApiIdentity?: HomeAssistantApi["identity"];
  private _lastHistoryDays?: number;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _context: () => ActiveCameraActivityContext,
    private readonly _fetch: ActivityFetcher<T>,
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
    this._stopRefresh();
    this._generation += 1;
  }

  public hostUpdated(): void {
    this._syncContext();
  }

  public retryMedia(item: ActiveCameraActivityItem, url: string): void {
    const key = `${item.id}:${item.revision}:${url}`;
    if (this._retriedMedia.has(key)) return;
    this._retriedMedia.add(key);
    void this._refresh(true);
  }

  public get activeCameraLabel(): string | undefined {
    return this._activeCameraLabel;
  }

  private _syncContext(): void {
    if (!this._connected) return;
    const context = this._context();
    const selectionChanged =
      context.cameraSelection !== this._subscribedSelection ||
      context.targetModuleId !== this._subscribedTarget;
    if (selectionChanged) {
      this._unsubscribe?.();
      this._unsubscribe = undefined;
      this._subscribedSelection = context.cameraSelection;
      this._subscribedTarget = context.targetModuleId;
      this._activeEntityId = undefined;
      this._activeCameraLabel = undefined;
      this.items = [];
      this._retriedMedia.clear();
      this._stopRefresh();
      this._generation += 1;
      if (context.cameraSelection && context.targetModuleId) {
        this._unsubscribe = context.cameraSelection.subscribe(
          context.targetModuleId,
          (state) => this._cameraChanged(state),
        );
      }
    }
    const queryChanged =
      context.api?.identity !== this._lastApiIdentity ||
      context.historyDays !== this._lastHistoryDays;
    this._lastApiIdentity = context.api?.identity;
    this._lastHistoryDays = context.historyDays;
    if (!selectionChanged && queryChanged && this._activeEntityId) {
      this._generation += 1;
      void this._refresh(false);
    }
  }

  private _cameraChanged(state: CameraSelectionState): void {
    const activeEntityId = state.activeEntityId;
    const activeCameraLabel = state.items.find(
      ({ entityId }) => entityId === activeEntityId,
    )?.label;
    if (
      activeEntityId === this._activeEntityId &&
      activeCameraLabel === this._activeCameraLabel
    ) {
      return;
    }
    const cameraChanged = activeEntityId !== this._activeEntityId;
    this._activeEntityId = activeEntityId;
    this._activeCameraLabel = activeCameraLabel;
    if (!cameraChanged) {
      this._host.requestUpdate();
      return;
    }
    this.items = [];
    this._retriedMedia.clear();
    this._stopRefresh();
    this._generation += 1;
    this._host.requestUpdate();
    if (!activeEntityId) return;
    void this._refresh(false);
    this._refreshTimer = window.setInterval(
      () => void this._refresh(false),
      EVENTS_REFRESH_INTERVAL_MS,
    );
  }

  private async _refresh(bypassCache: boolean): Promise<void> {
    const context = this._context();
    const api = context.api;
    const entityId = this._activeEntityId;
    if (!api || !entityId) return;
    const generation = this._generation;
    this.loading = true;
    this._host.requestUpdate();
    try {
      const items = await this._fetch(api, entityId, {
        bypassCache,
        historyDays: context.historyDays,
      });
      if (generation !== this._generation || entityId !== this._activeEntityId)
        return;
      this.items = items;
    } catch {
      if (generation === this._generation) this._onError();
    } finally {
      if (generation === this._generation) {
        this.loading = false;
        this._host.requestUpdate();
      }
    }
  }

  private _stopRefresh(): void {
    if (this._refreshTimer !== undefined)
      window.clearInterval(this._refreshTimer);
    this._refreshTimer = undefined;
  }
}
