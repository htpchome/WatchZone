import type { ReactiveController, ReactiveControllerHost } from "lit";

import { listRecordings, type RecordingHour } from "../../../api/recordings";
import {
  homeAssistantDateKey,
  resolvedHomeAssistantTimeZone,
} from "../../../core/date-time";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import type { CameraSelectionContext } from "../../camera-selection-context";
import type { MediaDateContext } from "../../media-date-context";

interface RecordingsControllerConfig {
  readonly api?: HomeAssistantApi;
  readonly cameraSelection?: CameraSelectionContext;
  readonly mediaDate?: MediaDateContext;
  readonly targetModuleId: string;
}

const CURRENT_DAY_REFRESH_MS = 60_000;

/** Owns recording selection, requests, cancellation, and current-day refresh. */
export class RecordingsController implements ReactiveController {
  public activeCameraLabel?: string;
  public activeEntityId?: string;
  public activeEntityIds: readonly string[] = [];
  public availableDates: readonly string[] = [];
  public hours: readonly RecordingHour[] = [];
  public loading = false;

  private _connected = false;
  private _request = 0;
  private _requestKey = "";
  private _selectedDate?: string;
  private _refreshTimer?: number;
  private _subscribedDate?: MediaDateContext;
  private _subscribedDateEntityId?: string;
  private _subscribedSelection?: CameraSelectionContext;
  private _subscribedTarget = "";
  private _unsubscribeDate?: () => void;
  private _unsubscribeSelection?: () => void;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _config: () => RecordingsControllerConfig,
    private readonly _onError: () => void,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    this._connected = true;
    this._syncSelection();
  }

  public hostDisconnected(): void {
    this._connected = false;
    if (this._subscribedDate && this._subscribedDateEntityId) {
      this._subscribedDate.clearAvailableDates(
        this._subscribedDateEntityId,
        this,
      );
    }
    this._unsubscribeSelection?.();
    this._unsubscribeDate?.();
    this._unsubscribeSelection = undefined;
    this._unsubscribeDate = undefined;
    this._subscribedSelection = undefined;
    this._subscribedTarget = "";
    this._subscribedDate = undefined;
    this._subscribedDateEntityId = undefined;
    this._clearRefresh();
    this._request += 1;
  }

  public hostUpdate(): void {
    this._syncSelection();
    this._syncDate();
    this._load();
  }

  public selectedDate(): string | undefined {
    return this._selectedDate;
  }

  public adjacentDate(direction: -1 | 1): string | undefined {
    const { api } = this._config();
    if (!api) return undefined;
    const current =
      this._selectedDate ?? homeAssistantDateKey(Date.now() / 1000, api.locale);
    const dates = [...new Set(this.availableDates)].sort();
    if (direction > 0) return dates.find((date) => date > current);
    let previous: string | undefined;
    for (const date of dates) {
      if (date >= current) break;
      previous = date;
    }
    return previous;
  }

  public selectDate(selectedDate: string): void {
    const { mediaDate } = this._config();
    const scopeId = this._dateScopeId;
    if (mediaDate && scopeId) mediaDate.select(scopeId, selectedDate);
  }

  private _syncSelection(): void {
    if (!this._connected) return;
    const { cameraSelection, targetModuleId } = this._config();
    if (
      cameraSelection === this._subscribedSelection &&
      targetModuleId === this._subscribedTarget
    ) {
      return;
    }
    this._unsubscribeSelection?.();
    this._subscribedSelection = cameraSelection;
    this._subscribedTarget = targetModuleId;
    this._setCamera([], undefined, undefined, undefined);
    if (cameraSelection && targetModuleId) {
      this._unsubscribeSelection = cameraSelection.subscribe(
        targetModuleId,
        ({
          activeEntityId,
          activeEntityIds,
          activeSelectionId,
          items,
          settled,
        }) => {
          if (settled === false) return;
          const entityIds = activeEntityIds?.length
            ? activeEntityIds
            : activeEntityId
              ? [activeEntityId]
              : [];
          this._setCamera(
            entityIds,
            activeEntityId,
            activeSelectionId,
            items.find(
              ({ entityId }) =>
                entityId === (activeSelectionId ?? activeEntityId),
            )?.label,
          );
        },
      );
    }
  }

  private _setCamera(
    entityIds: readonly string[],
    entityId: string | undefined,
    selectionId: string | undefined,
    title: string | undefined,
  ) {
    const previousScope = this._dateScopeId;
    if (
      entityIds.join("\u0000") === this.activeEntityIds.join("\u0000") &&
      entityId === this.activeEntityId &&
      selectionId === this._activeSelectionId &&
      title === this.activeCameraLabel
    ) {
      return;
    }
    this.activeEntityIds = entityIds;
    this.activeEntityId = entityId;
    this._activeSelectionId = selectionId;
    this.activeCameraLabel = title;
    this.availableDates = [];
    this.hours = [];
    this._requestKey = "";
    if (previousScope !== this._dateScopeId) this._syncDate();
    this._host.requestUpdate();
  }

  private _syncDate(): void {
    const { mediaDate } = this._config();
    const entityId = this._dateScopeId;
    if (
      mediaDate === this._subscribedDate &&
      entityId === this._subscribedDateEntityId
    ) {
      return;
    }
    if (this._subscribedDate && this._subscribedDateEntityId) {
      this._subscribedDate.clearAvailableDates(
        this._subscribedDateEntityId,
        this,
      );
    }
    this._unsubscribeDate?.();
    this._subscribedDate = mediaDate;
    this._subscribedDateEntityId = entityId;
    this._selectedDate = undefined;
    if (mediaDate && entityId) {
      this._unsubscribeDate = mediaDate.subscribe(entityId, (selectedDate) => {
        if (selectedDate === this._selectedDate) return;
        this._selectedDate = selectedDate;
        this.hours = [];
        this._requestKey = "";
        this._load();
        this._host.requestUpdate();
      });
    }
  }

  private _load(): void {
    if (!this._connected) return;
    const { api } = this._config();
    const entityIds = this.activeEntityIds;
    const scopeId = this._dateScopeId;
    if (!api || entityIds.length === 0 || !scopeId) return;
    const today = homeAssistantDateKey(Date.now() / 1000, api.locale);
    const selectedDate = this._selectedDate ?? today;
    const timezone = resolvedHomeAssistantTimeZone(api.locale);
    const key = `${entityIds.join("\u0000")}:${selectedDate}:${timezone}`;
    if (key === this._requestKey) return;
    this._requestKey = key;
    this.loading = true;
    this._host.requestUpdate();
    const request = ++this._request;
    void Promise.allSettled(
      entityIds.map((entityId, index) =>
        listRecordings(api, entityId, { selectedDate, timezone }).then(
          ({ days, hours }) => ({
            days,
            hours: hours.map((hour) => ({
              ...hour,
              source_entity_id: entityId,
              group_position:
                entityIds.length > 1
                  ? index === 0
                    ? ("A" as const)
                    : ("B" as const)
                  : undefined,
            })),
          }),
        ),
      ),
    )
      .then((results) => {
        if (request !== this._request) return;
        const windows = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        if (windows.length === 0) {
          const failure = results.find(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected",
          );
          throw failure?.reason;
        }
        this.availableDates = [...new Set(windows.flatMap(({ days }) => days))];
        this._subscribedDate?.publishAvailableDates(
          scopeId,
          this,
          this.availableDates,
        );
        this.hours = windows
          .flatMap(({ hours }) => hours)
          .sort(
            (left, right) =>
              right.start_time - left.start_time ||
              (left.group_position ?? "").localeCompare(
                right.group_position ?? "",
              ) ||
              left.id.localeCompare(right.id),
          );
        this.loading = false;
        this._scheduleRefresh(selectedDate === today);
        this._host.requestUpdate();
      })
      .catch(() => {
        if (request !== this._request) return;
        this.loading = false;
        this.availableDates = [];
        this._requestKey = "";
        this._subscribedDate?.clearAvailableDates(scopeId, this);
        this._onError();
        this._host.requestUpdate();
      });
  }

  private _scheduleRefresh(currentDay: boolean): void {
    this._clearRefresh();
    if (!currentDay) return;
    this._refreshTimer = window.setTimeout(() => {
      this._requestKey = "";
      this._load();
    }, CURRENT_DAY_REFRESH_MS);
  }

  private _clearRefresh(): void {
    if (this._refreshTimer === undefined) return;
    window.clearTimeout(this._refreshTimer);
    this._refreshTimer = undefined;
  }

  private _activeSelectionId?: string;

  private get _dateScopeId(): string | undefined {
    return this._activeSelectionId ?? this.activeEntityId;
  }
}
