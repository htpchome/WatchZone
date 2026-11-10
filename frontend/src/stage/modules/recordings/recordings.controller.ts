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
    const entityId = this.activeEntityId;
    if (mediaDate && entityId) mediaDate.select(entityId, selectedDate);
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
    this._setCamera(undefined, undefined);
    if (cameraSelection && targetModuleId) {
      this._unsubscribeSelection = cameraSelection.subscribe(
        targetModuleId,
        ({ activeEntityId, items, settled }) => {
          if (settled === false) return;
          this._setCamera(
            activeEntityId,
            items.find(({ entityId }) => entityId === activeEntityId)?.label,
          );
        },
      );
    }
  }

  private _setCamera(entityId: string | undefined, title: string | undefined) {
    if (entityId === this.activeEntityId && title === this.activeCameraLabel) {
      return;
    }
    this.activeEntityId = entityId;
    this.activeCameraLabel = title;
    this.availableDates = [];
    this.hours = [];
    this._requestKey = "";
    this._syncDate();
    this._host.requestUpdate();
  }

  private _syncDate(): void {
    const { mediaDate } = this._config();
    const entityId = this.activeEntityId;
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
    const entityId = this.activeEntityId;
    if (!api || !entityId) return;
    const today = homeAssistantDateKey(Date.now() / 1000, api.locale);
    const selectedDate = this._selectedDate ?? today;
    const timezone = resolvedHomeAssistantTimeZone(api.locale);
    const key = `${entityId}:${selectedDate}:${timezone}`;
    if (key === this._requestKey) return;
    this._requestKey = key;
    this.loading = true;
    this._host.requestUpdate();
    const request = ++this._request;
    void listRecordings(api, entityId, {
      selectedDate,
      timezone,
    })
      .then(({ days, hours }) => {
        if (request !== this._request) return;
        this.availableDates = days;
        this._subscribedDate?.publishAvailableDates(entityId, this, days);
        this.hours = hours;
        this.loading = false;
        this._scheduleRefresh(selectedDate === today);
        this._host.requestUpdate();
      })
      .catch(() => {
        if (request !== this._request) return;
        this.loading = false;
        this.availableDates = [];
        this._requestKey = "";
        this._subscribedDate?.clearAvailableDates(entityId, this);
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
}
