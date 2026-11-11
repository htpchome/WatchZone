import type { ReactiveController, ReactiveControllerHost } from "lit";

import { listExports, type ExportItem } from "../../../api/exports";
import { EXPORTS_CHANGED_EVENT } from "../../../core/constants";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  isExportJob,
  subscribeExportJobs,
  type ExportJob,
  type ExportLibraryItem,
} from "../../../features/exports";
import type {
  CameraSelectionContext,
  CameraSelectionItem,
} from "../../camera-selection-context";
import type {
  ExportFilterContext,
  ExportFilterState,
} from "../../export-filter-context";

const POLL_INTERVAL_MS = 3_000;

interface ExportsControllerConfig {
  readonly api?: HomeAssistantApi;
  readonly cameraSelection?: CameraSelectionContext;
  readonly exportFilter?: ExportFilterContext;
  readonly placeableId: string;
  readonly targetModuleId: string;
}

/** Owns mixed-camera export loading, processing refresh, and camera filtering. */
export class ExportsController implements ReactiveController {
  public items: readonly ExportItem[] = [];
  public loading = false;
  public selectedEntityIds: readonly string[] = [];

  private _cameras: readonly CameraSelectionItem[] = [];
  private _connected = false;
  private _generation = 0;
  private _jobs: readonly ExportJob[] = [];
  private _jobsApi?: HomeAssistantApi;
  private _jobsUnsubscribe?: () => void;
  private _lastApi?: HomeAssistantApi;
  private _lastEntityKey = "";
  private _lastFilter?: ExportFilterContext;
  private _lastPlaceableId = "";
  private _lastSelection?: CameraSelectionContext;
  private _lastTargetModuleId = "";
  private _pollTimer?: number;
  private _refreshAfterLoad = false;
  private _unsubscribeFilter?: () => void;
  private _unsubscribeSelection?: () => void;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _config: () => ExportsControllerConfig,
    private readonly _onError: () => void,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    this._connected = true;
    this._refreshAfterLoad = true;
    this._lastApi = undefined;
    this._lastEntityKey = "";
    this._lastFilter = undefined;
    this._lastPlaceableId = "";
    this._lastSelection = undefined;
    this._lastTargetModuleId = "";
    window.addEventListener(EXPORTS_CHANGED_EVENT, this._exportsChanged);
    this._syncJobs(this._config().api);
    this._sync();
  }

  public hostDisconnected(): void {
    this._connected = false;
    window.removeEventListener(EXPORTS_CHANGED_EVENT, this._exportsChanged);
    this._jobsUnsubscribe?.();
    this._jobsUnsubscribe = undefined;
    this._jobsApi = undefined;
    this._jobs = [];
    this._generation += 1;
    this._clearTimer();
    this._unsubscribeFilter?.();
    this._unsubscribeSelection?.();
    this._unsubscribeFilter = undefined;
    this._unsubscribeSelection = undefined;
    const { exportFilter, placeableId } = this._config();
    if (exportFilter && placeableId) exportFilter.clear(placeableId, this);
  }

  public hostUpdate(): void {
    this._sync();
  }

  public filteredItems(): readonly ExportLibraryItem[] {
    const items = this._libraryItems();
    if (this.selectedEntityIds.length === 0) return items;
    const selected = new Set(this.selectedEntityIds);
    return items.filter((item) =>
      selected.has(isExportJob(item) ? item.entityId : item.entity_id),
    );
  }

  public cameraLabel(entityId: string, fallback: string): string {
    return (
      this._cameras.find((camera) => camera.entityId === entityId)?.label ??
      fallback
    );
  }

  public refresh(): void {
    void this._load();
  }

  private readonly _exportsChanged = (): void => {
    this._refreshAfterLoad = true;
    this.refresh();
  };

  public renameItem(entityId: string, id: string, name: string): void {
    this.items = this.items.map((item) =>
      item.entity_id === entityId && item.id === id ? { ...item, name } : item,
    );
    const { exportFilter, placeableId } = this._config();
    this._publishFacets(exportFilter, placeableId);
    this._host.requestUpdate();
  }

  private _sync(): void {
    if (!this._connected) return;
    const config = this._config();
    this._syncJobs(config.api);
    if (
      config.cameraSelection !== this._lastSelection ||
      config.targetModuleId !== this._lastTargetModuleId
    ) {
      this._unsubscribeSelection?.();
      this._lastSelection = config.cameraSelection;
      this._lastTargetModuleId = config.targetModuleId;
      this._cameras = [];
      if (config.cameraSelection && config.targetModuleId) {
        this._unsubscribeSelection = config.cameraSelection.subscribe(
          config.targetModuleId,
          ({ items }) => {
            this._cameras = items;
            this._lastApi = this._config().api;
            this._lastEntityKey = items
              .map(({ entityId }) => entityId)
              .join("\n");
            void this._load();
          },
        );
      }
    }
    if (
      config.exportFilter !== this._lastFilter ||
      config.placeableId !== this._lastPlaceableId
    ) {
      this._unsubscribeFilter?.();
      this._lastFilter = config.exportFilter;
      this._lastPlaceableId = config.placeableId;
      this.selectedEntityIds = [];
      if (config.exportFilter && config.placeableId) {
        this._unsubscribeFilter = config.exportFilter.subscribe(
          config.placeableId,
          (state) => this._filterChanged(state),
        );
      }
    }
    const entityKey = this._cameras.map(({ entityId }) => entityId).join("\n");
    if (config.api !== this._lastApi || entityKey !== this._lastEntityKey) {
      this._lastApi = config.api;
      this._lastEntityKey = entityKey;
      void this._load();
    }
  }

  private _syncJobs(api: HomeAssistantApi | undefined): void {
    if (api === this._jobsApi) return;
    this._jobsUnsubscribe?.();
    this._jobsUnsubscribe = undefined;
    this._jobsApi = api;
    this._jobs = [];
    if (!api || !this._connected) return;
    this._jobsUnsubscribe = subscribeExportJobs(api, (jobs) => {
      this._jobs = jobs;
      const completed = jobs.some(
        (job) => job.status === "success" && job.completedItem,
      );
      if (completed) {
        this._refreshAfterLoad = true;
        this.refresh();
      }
      const { exportFilter, placeableId } = this._config();
      this._publishFacets(exportFilter, placeableId);
      this._host.requestUpdate();
    });
  }

  private _libraryItems(): readonly ExportLibraryItem[] {
    const activeExportIds = new Set(
      this._jobs
        .filter((job) => job.status !== "success")
        .map((job) => job.exportId)
        .filter((id): id is string => Boolean(id)),
    );
    const completed = this._jobs.flatMap((job) =>
      job.status === "success" && job.completedItem ? [job.completedItem] : [],
    );
    const providerItems = this.items.filter(
      (item) => !activeExportIds.has(item.id),
    );
    const drafts = this._jobs.filter((job) => job.status !== "success");
    const merged = new Map<string, ExportLibraryItem>();
    for (const item of providerItems) {
      merged.set(`${item.entity_id}:${item.id}`, item);
    }
    for (const item of completed) {
      merged.set(`${item.entity_id}:${item.id}`, item);
    }
    for (const job of drafts) merged.set(job.requestId, job);
    return [...merged.values()].sort(
      (left, right) =>
        (isExportJob(right) ? right.createdTime : right.created_time) -
        (isExportJob(left) ? left.createdTime : left.created_time),
    );
  }

  private _filterChanged(state: ExportFilterState): void {
    this.selectedEntityIds = state.selectedEntityIds;
    this._host.requestUpdate();
  }

  private async _load(): Promise<void> {
    const { api, exportFilter, placeableId } = this._config();
    const entityIds = this._cameras.map(({ entityId }) => entityId);
    if (!api || entityIds.length === 0) {
      this.items = [];
      this.loading = false;
      this._publishFacets(exportFilter, placeableId);
      this._clearTimer();
      this._host.requestUpdate();
      return;
    }
    const generation = ++this._generation;
    this.loading = true;
    this._host.requestUpdate();
    try {
      const items = await listExports(api, entityIds);
      if (!this._connected || generation !== this._generation) return;
      this.items = items;
      this.loading = false;
      this._publishFacets(exportFilter, placeableId);
      const refreshAfterLoad = this._refreshAfterLoad;
      this._refreshAfterLoad = false;
      this._schedulePoll(
        refreshAfterLoad || items.some(({ in_progress }) => in_progress),
      );
      this._host.requestUpdate();
    } catch {
      if (!this._connected || generation !== this._generation) return;
      this.loading = false;
      this._clearTimer();
      this._onError();
      this._host.requestUpdate();
    }
  }

  private _publishFacets(
    filter: ExportFilterContext | undefined,
    placeableId: string,
  ): void {
    if (!filter || !placeableId) return;
    const withExports = new Set(
      this._libraryItems().map((item) =>
        isExportJob(item) ? item.entityId : item.entity_id,
      ),
    );
    filter.publish(
      placeableId,
      this,
      this._cameras.filter(({ entityId }) => withExports.has(entityId)),
    );
  }

  private _schedulePoll(required: boolean): void {
    this._clearTimer();
    if (!required || !this._connected) return;
    this._pollTimer = window.setTimeout(() => this.refresh(), POLL_INTERVAL_MS);
  }

  private _clearTimer(): void {
    if (this._pollTimer === undefined) return;
    window.clearTimeout(this._pollTimer);
    this._pollTimer = undefined;
  }
}
