import type { ReactiveController, ReactiveControllerHost } from "lit";

import {
  ACTIVITY_INITIAL_PAGE_SIZE,
  ACTIVITY_OLDER_PAGE_SIZE,
  type ActivityWindowPage,
} from "../../api/activity-window";
import type {
  CameraSelectionContext,
  CameraSelectionState,
} from "../camera-selection-context";
import {
  ACTIVITY_FALLBACK_RECONCILE_INTERVAL_MS,
  ACTIVITY_EMPTY_CONFIRM_DELAY_MS,
  ACTIVITY_UPDATE_RECONCILE_DELAYS_MS,
  ACTIVITY_UPDATE_SUBSCRIBE_RETRY_MS,
} from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import {
  subscribeActivityUpdates,
  type ActivityUpdateKind,
  type ActivityUpdateNotification,
} from "../../api/activity-updates";

export interface ActiveCameraActivityItem {
  readonly id: string;
  readonly revision: string;
  readonly start_time: number;
}

interface RetriableActivityItem {
  readonly id: string;
}

interface ActiveCameraActivityContext {
  readonly api?: HomeAssistantApi;
  readonly cameraSelection?: CameraSelectionContext;
  readonly historyDays: number;
  readonly targetModuleId: string;
}

const INACTIVE_CAMERA_RECENT_ITEMS = 10;

type ActivityFetcher<T extends ActiveCameraActivityItem> = (
  api: HomeAssistantApi,
  entityId: string,
  options: {
    readonly before?: number;
    readonly bypassCache: boolean;
    readonly historyDays: number;
    readonly limit: number;
  },
) => Promise<ActivityWindowPage<T>>;

type ActivityUpdateMapper<T extends ActiveCameraActivityItem> = (
  notification: ActivityUpdateNotification,
) => T | undefined;

/** Owns camera-scoped activity loading, push invalidation, and reconciliation. */
export class ActiveCameraActivityController<
  T extends ActiveCameraActivityItem,
> implements ReactiveController {
  public items: readonly T[] = [];
  public loading = false;

  private _activeEntityId?: string;
  private _activeEntityIds: readonly string[] = [];
  private _activeCameraLabel?: string;
  private _itemsScopeKey = "";
  private _connected = false;
  private _emptyConfirmationPending = false;
  private _emptyConfirmTimer?: number;
  private _generation = 0;
  private _olderLoadPending = false;
  private _refreshPending = false;
  private _queuedRefresh?: {
    readonly bypassCache: boolean;
    readonly resetWindow: boolean;
  };
  private readonly _entityIdByItemId = new Map<string, string>();
  private readonly _cameraLabelByEntityId = new Map<string, string>();
  private readonly _pageByEntityId = new Map<
    string,
    Pick<ActivityWindowPage<T>, "hasMore" | "nextBefore">
  >();
  private readonly _recentItemsByScope = new Map<string, readonly T[]>();
  private _refreshTimer?: number;
  private readonly _retriedMedia = new Set<string>();
  private _subscribedSelection?: CameraSelectionContext;
  private _subscribedTarget = "";
  private _unsubscribe?: () => void;
  private _lastApiIdentity?: HomeAssistantApi["identity"];
  private _lastHistoryDays?: number;
  private readonly _updateReconcileTimers = new Set<number>();
  private readonly _updateSubscribeRetryTimers = new Map<string, number>();
  private _updatesGeneration = 0;
  private readonly _updatesUnsubscribes = new Map<string, () => void>();

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _context: () => ActiveCameraActivityContext,
    private readonly _fetch: ActivityFetcher<T>,
    private readonly _onError: () => void,
    private readonly _activityKind: ActivityUpdateKind,
    private readonly _mapUpdate?: ActivityUpdateMapper<T>,
    private readonly _selectionItems?: (
      state: CameraSelectionState,
    ) => readonly T[],
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
    this._stopUpdates();
    this._stopEmptyConfirmation();
    this._queuedRefresh = undefined;
    this._entityIdByItemId.clear();
    this._cameraLabelByEntityId.clear();
    this._pageByEntityId.clear();
    this._recentItemsByScope.clear();
    this._retriedMedia.clear();
    this._generation += 1;
  }

  public hostUpdate(): void {
    this._syncContext();
  }

  public retryMedia(item: RetriableActivityItem, url: string): void {
    const key = `${item.id}:${url}`;
    if (this._retriedMedia.has(key)) return;
    this._retriedMedia.add(key);
    void this._refresh(true, true);
  }

  public refresh(): Promise<void> {
    return this._refresh(true, false);
  }

  public loadMore(): Promise<void> {
    return this._loadOlder();
  }

  public updateItem(id: string, update: (item: T) => T): void {
    const scopeKey = this._activeScopeKey;
    if (!scopeKey) return;
    let changed = false;
    const items = this.items.map((item) => {
      if (item.id !== id) return item;
      changed = true;
      return update(item);
    });
    if (!changed) return;
    this._setItems(scopeKey, items);
    this._host.requestUpdate();
  }

  public get activeCameraLabel(): string | undefined {
    return this._activeCameraLabel;
  }

  public get activeEntityId(): string | undefined {
    return this._activeEntityId;
  }

  public get activeEntityIds(): readonly string[] {
    return this._activeEntityIds;
  }

  public get hasMore(): boolean {
    return this._activeEntityIds.some(
      (entityId) => this._pageByEntityId.get(entityId)?.hasMore === true,
    );
  }

  public entityIdFor(itemId: string): string | undefined {
    return this._entityIdByItemId.get(itemId) ?? this._activeEntityId;
  }

  public cameraLabelFor(itemId: string): string | undefined {
    const entityId = this.entityIdFor(itemId);
    return entityId ? this._cameraLabelByEntityId.get(entityId) : undefined;
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
      this._activeEntityIds = [];
      this._activeCameraLabel = undefined;
      this._entityIdByItemId.clear();
      this._cameraLabelByEntityId.clear();
      this._retriedMedia.clear();
      this._stopRefresh();
      this._stopUpdates();
      this._stopEmptyConfirmation();
      this._generation += 1;
      if (!context.cameraSelection || !context.targetModuleId) {
        this.items = [];
        this._itemsScopeKey = "";
        this._host.requestUpdate();
      }
      if (context.cameraSelection && context.targetModuleId) {
        this._unsubscribe = context.cameraSelection.subscribe(
          context.targetModuleId,
          (state) => this._cameraChanged(state),
        );
      }
    }
    const apiChanged = context.api?.identity !== this._lastApiIdentity;
    const queryChanged =
      apiChanged || context.historyDays !== this._lastHistoryDays;
    this._lastApiIdentity = context.api?.identity;
    this._lastHistoryDays = context.historyDays;
    if (apiChanged) this._recentItemsByScope.clear();
    if (!selectionChanged && queryChanged && this._activeEntityIds.length > 0) {
      this._generation += 1;
      this._pageByEntityId.clear();
      if (apiChanged) {
        this._stopUpdates();
        if (context.api) {
          this._subscribeUpdates(context.api, this._activeEntityIds);
        }
      }
      void this._refresh(false, true);
    }
  }

  private _cameraChanged(state: CameraSelectionState): void {
    // Keep network, sorting, and list rendering out of the carousel's active
    // direct-manipulation transition. The camera itself has already selected
    // and connected; activity catches up when the transition settles.
    if (state.settled === false) return;
    this._cameraLabelByEntityId.clear();
    for (const item of state.items) {
      for (const member of item.entityLabels ?? []) {
        this._cameraLabelByEntityId.set(member.entityId, member.label);
      }
    }
    this._pruneSelectionCaches(state);
    const activeEntityId = state.activeEntityId;
    const activeEntityIds = [
      ...new Set(
        (state.activeEntityIds?.length
          ? state.activeEntityIds
          : activeEntityId
            ? [activeEntityId]
            : []
        ).filter(Boolean),
      ),
    ];
    const scopeKey = activeEntityIds.join("\u0000");
    const activeCameraLabel = state.items.find(
      ({ entityId }) =>
        entityId === (state.activeSelectionId ?? activeEntityId),
    )?.label;
    const selectionItems = this._selectionItems?.(state) ?? [];
    if (
      scopeKey === this._activeScopeKey &&
      activeCameraLabel === this._activeCameraLabel
    ) {
      if (scopeKey && this._mergeSelectionItems(scopeKey, selectionItems)) {
        this._host.requestUpdate();
      }
      return;
    }
    const cameraChanged = scopeKey !== this._activeScopeKey;
    this._activeEntityId = activeEntityId;
    this._activeEntityIds = activeEntityIds;
    if (activeCameraLabel !== undefined) {
      this._activeCameraLabel = activeCameraLabel;
    }
    if (!cameraChanged) {
      this._host.requestUpdate();
      return;
    }
    this._retriedMedia.clear();
    this._pageByEntityId.clear();
    this._stopRefresh();
    this._stopUpdates();
    this._stopEmptyConfirmation();
    this._generation += 1;
    if (scopeKey && this._itemsScopeKey !== scopeKey) {
      this.items = this._recentItemsByScope.get(scopeKey) ?? [];
      this._itemsScopeKey = scopeKey;
    }
    if (scopeKey) this._mergeSelectionItems(scopeKey, selectionItems);
    this._host.requestUpdate();
    if (activeEntityIds.length === 0) return;
    // A review may have entered draft while this camera was inactive. The
    // active-only update subscription cannot replay that earlier notification,
    // so activation starts with one authoritative, cache-bypassed query.
    void this._refresh(true, true);
    const api = this._context().api;
    if (api) this._subscribeUpdates(api, activeEntityIds);
    this._refreshTimer = window.setInterval(
      () => void this._refresh(true, false),
      ACTIVITY_FALLBACK_RECONCILE_INTERVAL_MS,
    );
  }

  private async _refresh(
    bypassCache: boolean,
    resetWindow: boolean,
  ): Promise<void> {
    if (this._refreshPending || this._olderLoadPending) {
      this._queueRefresh(bypassCache, resetWindow);
      return;
    }
    const context = this._context();
    const api = context.api;
    const entityIds = this._activeEntityIds;
    const scopeKey = this._activeScopeKey;
    if (!api || entityIds.length === 0 || !scopeKey) return;
    const generation = this._generation;
    this._refreshPending = true;
    if (resetWindow) {
      this._pageByEntityId.clear();
    }
    this.loading = true;
    this._host.requestUpdate();
    try {
      const results = await Promise.allSettled(
        entityIds.map((entityId) =>
          this._fetch(api, entityId, {
            bypassCache,
            historyDays: context.historyDays,
            limit: ACTIVITY_INITIAL_PAGE_SIZE,
          }),
        ),
      );
      const responses = results.map((result) =>
        result.status === "fulfilled" ? result.value.items : [],
      );
      if (results.every(({ status }) => status === "rejected")) {
        const failure = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );
        throw failure?.reason;
      }
      const items = responses.flat();
      responses.forEach((response, index) => {
        const entityId = entityIds[index];
        if (entityId) this._rememberItemSources(entityId, response);
      });
      if (generation !== this._generation || scopeKey !== this._activeScopeKey)
        return;
      if (resetWindow) {
        results.forEach((result, index) => {
          const entityId = entityIds[index];
          if (!entityId || result.status !== "fulfilled") return;
          this._pageByEntityId.set(entityId, {
            hasMore: result.value.hasMore,
            ...(result.value.nextBefore !== undefined
              ? { nextBefore: result.value.nextBefore }
              : {}),
          });
        });
      }
      if (!resetWindow) {
        this._stopEmptyConfirmation();
        this._setItems(
          scopeKey,
          mergeActivityItems(this.items, items, context.historyDays),
        );
        return;
      }
      if (items.length === 0 && this.items.length > 0) {
        if (!this._emptyConfirmationPending) {
          this._emptyConfirmationPending = true;
          this._emptyConfirmTimer = window.setTimeout(() => {
            this._emptyConfirmTimer = undefined;
            void this._refresh(false, true);
          }, ACTIVITY_EMPTY_CONFIRM_DELAY_MS);
        }
        return;
      }
      this._stopEmptyConfirmation();
      this._setItems(
        scopeKey,
        mergeActivityItems(this.items, items, context.historyDays),
      );
    } catch {
      if (generation === this._generation) this._onError();
    } finally {
      if (generation === this._generation) {
        this.loading = false;
        this._host.requestUpdate();
      }
      this._refreshPending = false;
      this._runQueuedRefresh();
    }
  }

  private async _loadOlder(): Promise<void> {
    const context = this._context();
    const api = context.api;
    const scopeKey = this._activeScopeKey;
    if (!api || !scopeKey || this.loading) return;
    const requests = this._activeEntityIds.flatMap((entityId) => {
      const page = this._pageByEntityId.get(entityId);
      return page?.hasMore && page.nextBefore !== undefined
        ? [{ before: page.nextBefore, entityId }]
        : [];
    });
    if (requests.length === 0) return;

    const generation = this._generation;
    this._olderLoadPending = true;
    this.loading = true;
    this._host.requestUpdate();
    try {
      const results = await Promise.allSettled(
        requests.map(({ before, entityId }) =>
          this._fetch(api, entityId, {
            before,
            bypassCache: false,
            historyDays: context.historyDays,
            limit: ACTIVITY_OLDER_PAGE_SIZE,
          }),
        ),
      );
      if (results.every(({ status }) => status === "rejected")) {
        const failure = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );
        throw failure?.reason;
      }
      if (generation !== this._generation || scopeKey !== this._activeScopeKey)
        return;
      const incoming: T[] = [];
      results.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        const entityId = requests[index]?.entityId;
        if (!entityId) return;
        this._pageByEntityId.set(entityId, {
          hasMore: result.value.hasMore,
          ...(result.value.nextBefore !== undefined
            ? { nextBefore: result.value.nextBefore }
            : {}),
        });
        this._rememberItemSources(entityId, result.value.items);
        incoming.push(...result.value.items);
      });
      this._setItems(
        scopeKey,
        mergeActivityItems(this.items, incoming, context.historyDays),
      );
    } catch {
      if (generation === this._generation) this._onError();
    } finally {
      if (generation === this._generation) {
        this.loading = false;
        this._host.requestUpdate();
      }
      this._olderLoadPending = false;
      this._runQueuedRefresh();
    }
  }

  private _queueRefresh(bypassCache: boolean, resetWindow: boolean): void {
    this._queuedRefresh = {
      bypassCache: bypassCache || this._queuedRefresh?.bypassCache === true,
      resetWindow: resetWindow || this._queuedRefresh?.resetWindow === true,
    };
  }

  private _runQueuedRefresh(): void {
    if (
      !this._connected ||
      this._refreshPending ||
      this._olderLoadPending ||
      !this._queuedRefresh
    )
      return;
    const queued = this._queuedRefresh;
    this._queuedRefresh = undefined;
    void this._refresh(queued.bypassCache, queued.resetWindow);
  }

  private _stopRefresh(): void {
    if (this._refreshTimer !== undefined)
      window.clearInterval(this._refreshTimer);
    this._refreshTimer = undefined;
  }

  private _subscribeUpdates(
    api: HomeAssistantApi,
    entityIds: readonly string[],
  ): void {
    const generation = ++this._updatesGeneration;
    for (const entityId of entityIds) {
      this._subscribeEntityUpdates(api, entityId, generation);
    }
  }

  private _subscribeEntityUpdates(
    api: HomeAssistantApi,
    entityId: string,
    generation: number,
  ): void {
    void Promise.resolve(
      subscribeActivityUpdates(
        api,
        entityId,
        this._activityKind,
        (notification) => {
          if (
            generation !== this._updatesGeneration ||
            !this._activeEntityIds.includes(entityId)
          )
            return;
          const update = this._mapUpdate?.(notification);
          if (update) {
            this._rememberItemSources(entityId, [update]);
            this._setItems(
              this._activeScopeKey,
              mergeActivityItems(
                this.items,
                [update],
                this._context().historyDays,
              ),
            );
            this._host.requestUpdate();
          }
          void this._refresh(true, false);
          if (this._updateReconcileTimers.size > 0) return;
          for (const delay of ACTIVITY_UPDATE_RECONCILE_DELAYS_MS) {
            const timer = window.setTimeout(() => {
              this._updateReconcileTimers.delete(timer);
              void this._refresh(true, false);
            }, delay);
            this._updateReconcileTimers.add(timer);
          }
        },
      ),
    )
      .then((unsubscribe) => {
        if (
          generation !== this._updatesGeneration ||
          !this._activeEntityIds.includes(entityId)
        ) {
          unsubscribe?.();
          return;
        }
        if (unsubscribe) this._updatesUnsubscribes.set(entityId, unsubscribe);
      })
      .catch(() => {
        if (
          generation !== this._updatesGeneration ||
          !this._activeEntityIds.includes(entityId)
        )
          return;
        const timer = window.setTimeout(() => {
          this._updateSubscribeRetryTimers.delete(entityId);
          if (
            generation === this._updatesGeneration &&
            this._activeEntityIds.includes(entityId)
          ) {
            this._subscribeEntityUpdates(api, entityId, generation);
          }
        }, ACTIVITY_UPDATE_SUBSCRIBE_RETRY_MS);
        this._updateSubscribeRetryTimers.set(entityId, timer);
      });
  }

  private _stopUpdates(): void {
    this._updatesGeneration += 1;
    for (const unsubscribe of this._updatesUnsubscribes.values()) unsubscribe();
    this._updatesUnsubscribes.clear();
    this._clearUpdateReconcileTimers();
    for (const timer of this._updateSubscribeRetryTimers.values()) {
      window.clearTimeout(timer);
    }
    this._updateSubscribeRetryTimers.clear();
  }

  private _clearUpdateReconcileTimers(): void {
    for (const timer of this._updateReconcileTimers) {
      window.clearTimeout(timer);
    }
    this._updateReconcileTimers.clear();
  }

  private _setItems(scopeKey: string, items: readonly T[]): void {
    this.items = items;
    this._itemsScopeKey = scopeKey;
    // Preserve only the newest rows for instant return navigation. Keeping the
    // complete history for every visited camera multiplies the largest data
    // structure in the card; the full active-camera window is rehydrated in
    // the background after the cached first paint.
    this._recentItemsByScope.set(
      scopeKey,
      items.slice(0, INACTIVE_CAMERA_RECENT_ITEMS),
    );
    this._pruneItemSources();
  }

  private _mergeSelectionItems(
    scopeKey: string,
    incoming: readonly T[],
  ): boolean {
    if (incoming.length === 0) return false;
    const currentRevisions = new Map(
      this.items.map(({ id, revision }) => [id, revision]),
    );
    if (
      incoming.every(
        ({ id, revision }) => currentRevisions.get(id) === revision,
      )
    ) {
      return false;
    }
    this._setItems(
      scopeKey,
      mergeActivityItems(this.items, incoming, this._context().historyDays),
    );
    return true;
  }

  private _stopEmptyConfirmation(): void {
    if (this._emptyConfirmTimer !== undefined) {
      window.clearTimeout(this._emptyConfirmTimer);
    }
    this._emptyConfirmTimer = undefined;
    this._emptyConfirmationPending = false;
  }

  private get _activeScopeKey(): string {
    return this._activeEntityIds.join("\u0000");
  }

  private _rememberItemSources(entityId: string, items: readonly T[]): void {
    for (const item of items) this._entityIdByItemId.set(item.id, entityId);
  }

  private _pruneItemSources(): void {
    const retained = new Set(this.items.map(({ id }) => id));
    for (const items of this._recentItemsByScope.values()) {
      for (const item of items) retained.add(item.id);
    }
    for (const id of this._entityIdByItemId.keys()) {
      if (!retained.has(id)) this._entityIdByItemId.delete(id);
    }
  }

  private _pruneSelectionCaches(state: CameraSelectionState): void {
    const validScopes = new Set<string>();
    for (const item of state.items) {
      const entityIds = item.entityIds?.length
        ? [...new Set(item.entityIds.filter(Boolean))]
        : item.entityId
          ? [item.entityId]
          : [];
      for (const entityId of entityIds) validScopes.add(entityId);
      if (entityIds.length > 1) validScopes.add(entityIds.join("\u0000"));
    }
    for (const scopeKey of this._recentItemsByScope.keys()) {
      if (!validScopes.has(scopeKey)) this._recentItemsByScope.delete(scopeKey);
    }
    this._pruneItemSources();
  }
}

function mergeActivityItems<T extends ActiveCameraActivityItem>(
  current: readonly T[],
  incoming: readonly T[],
  historyDays: number,
): readonly T[] {
  const after = Date.now() / 1000 - historyDays * 24 * 60 * 60;
  const merged = new Map(
    current
      .filter(({ start_time }) => start_time >= after)
      .map((item) => [item.id, item]),
  );
  for (const item of incoming) merged.set(item.id, item);
  return [...merged.values()].sort(
    (left, right) =>
      right.start_time - left.start_time || left.id.localeCompare(right.id),
  );
}
