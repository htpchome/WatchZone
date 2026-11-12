import { html, LitElement, nothing } from "lit";

import { listReviews, type ReviewItem } from "../../api/reviews";
import { ACTIVITY_CALENDAR_TAG } from "../../core/constants";
import { homeAssistantDateKey } from "../../core/date-time";
import type {
  HomeAssistantApi,
  HomeAssistantLocale,
} from "../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { renderIcon } from "../../ui/icons";
import { ActiveCameraActivityController } from "./active-camera-activity.controller";
import type { CameraSelectionContext } from "../camera-selection-context";
import type { MediaDateContext } from "../media-date-context";
import { activityCalendarStyles } from "./activity-calendar.styles";
import { ActivityPopoverController } from "./activity-popover.controller";

interface CalendarMonth {
  readonly month: number;
  readonly year: number;
}

export type ActivityCalendarMode = "activity" | "recordings";

/** Localized activity-date popover shared by the activity module stack. */
export class ActivityCalendar extends LitElement {
  public static properties = {
    api: { attribute: false },
    cameraSelection: { attribute: false },
    dateContext: { attribute: false },
    disabled: { type: Boolean },
    disabledLabel: { attribute: false },
    historyDays: { attribute: false },
    localize: { attribute: false },
    mode: { attribute: false },
    targetModuleId: { attribute: false },
    _open: { state: true },
    _selectedDate: { state: true },
    _visibleMonth: { state: true },
  };

  public api?: HomeAssistantApi;
  public cameraSelection?: CameraSelectionContext;
  public dateContext?: MediaDateContext;
  public disabled = false;
  public disabledLabel = "";
  public historyDays = 5;
  public localize: LocalizeFunction = englishLocalize;
  public mode: ActivityCalendarMode = "activity";
  public targetModuleId = "";

  private _open = false;
  private _selectedDate?: string;
  private _visibleMonth = monthFromKey(this._todayKey());
  private _activeEntityId?: string;
  private _subscribedCameraSelection?: CameraSelectionContext;
  private _subscribedTargetModuleId = "";
  private _subscribedEntityId?: string;
  private _subscribedDateContext?: MediaDateContext;
  private _subscribedAvailabilityEntityId?: string;
  private _unsubscribeDate?: () => void;
  private _unsubscribeAvailability?: () => void;
  private _unsubscribeCameraSelection?: () => void;
  private _recordingDays: readonly string[] = [];
  private readonly _popover = new ActivityPopoverController(
    this,
    () => this._open,
    ".calendar-trigger",
  );

  private readonly _activity = new ActiveCameraActivityController<ReviewItem>(
    this,
    () => ({
      api: this._open && this.mode === "activity" ? this.api : undefined,
      cameraSelection: this._open ? this.cameraSelection : undefined,
      historyDays: this.historyDays,
      targetModuleId: this._open ? this.targetModuleId : "",
    }),
    listReviews,
    () => undefined,
    "reviews",
    (notification) => notification.review,
  );

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("pointerdown", this._handleDocumentPointerDown);
    document.addEventListener("keydown", this._handleDocumentKeyDown);
  }

  public disconnectedCallback(): void {
    document.removeEventListener(
      "pointerdown",
      this._handleDocumentPointerDown,
    );
    document.removeEventListener("keydown", this._handleDocumentKeyDown);
    this._unsubscribeDate?.();
    this._unsubscribeAvailability?.();
    this._unsubscribeCameraSelection?.();
    this._subscribedDateContext = undefined;
    this._subscribedCameraSelection = undefined;
    this._subscribedTargetModuleId = "";
    super.disconnectedCallback();
  }

  protected willUpdate(): void {
    this._syncCameraSelection();
    const entityId = this._activeEntityId;
    if (
      this.dateContext === this._subscribedDateContext &&
      entityId === this._subscribedEntityId &&
      entityId === this._subscribedAvailabilityEntityId
    ) {
      return;
    }
    this._unsubscribeDate?.();
    this._unsubscribeAvailability?.();
    this._subscribedDateContext = this.dateContext;
    this._subscribedEntityId = entityId;
    this._subscribedAvailabilityEntityId = entityId;
    this._selectedDate = undefined;
    this._recordingDays = [];
    if (this.dateContext && entityId) {
      this._unsubscribeDate = this.dateContext.subscribe(
        entityId,
        (selectedDate) => {
          if (selectedDate === this._selectedDate) return;
          this._selectedDate = selectedDate;
        },
      );
      this._unsubscribeAvailability = this.dateContext.subscribeAvailableDates(
        entityId,
        (availableDates) => {
          this._recordingDays = availableDates;
          this.requestUpdate();
        },
      );
    }
  }

  protected render() {
    const markedDates = new Set(
      this.mode === "recordings"
        ? this._recordingDays
        : this._activity.items.map(({ start_time }) =>
            homeAssistantDateKey(start_time, this.api?.locale),
          ),
    );
    return html`
      <button
        class=${`calendar-trigger${this._selectedDate ? " selected" : ""}`}
        type="button"
        ?disabled=${this.disabled}
        aria-expanded=${this._open ? "true" : "false"}
        aria-haspopup="dialog"
        aria-label=${
          this.disabled && this.disabledLabel
            ? this.disabledLabel
            : this.localize(
                this.mode === "recordings"
                  ? "recordings.calendar_open"
                  : "calendar.open",
              )
        }
        title=${
          this.disabled && this.disabledLabel
            ? this.disabledLabel
            : this.localize(
                this.mode === "recordings"
                  ? "recordings.calendar_open"
                  : "calendar.open",
              )
        }
        @click=${this._toggle}
      >
        ${renderIcon("calendar")}
      </button>
      ${this._open ? this._renderPopover(markedDates) : nothing}
    `;
  }

  private _renderPopover(markedDates: ReadonlySet<string>) {
    const cells = calendarCells(this._visibleMonth, this._firstWeekday());
    const todayKey = this._todayKey();
    const oldestKey =
      this.mode === "recordings"
        ? this._recordingDays.reduce(
            (oldest, key) => (key < oldest ? key : oldest),
            todayKey,
          )
        : homeAssistantDateKey(
            Date.now() / 1000 - this.historyDays * 24 * 60 * 60,
            this.api?.locale,
          );
    return html`<section
      class="popover"
      popover="manual"
      role="dialog"
      aria-label=${this.localize(
        this.mode === "recordings"
          ? "recordings.calendar_title"
          : "calendar.title",
      )}
    >
      <header class="header">
        <button
          class="month-button"
          type="button"
          aria-label=${this.localize("calendar.previous_month")}
          ?disabled=${!this._canMoveMonth(-1, oldestKey, todayKey)}
          @click=${() => this._moveMonth(-1)}
        >
          ${renderIcon("chevronLeft")}
        </button>
        <h3 class="month-title">${this._monthTitle()}</h3>
        <button
          class="month-button"
          type="button"
          aria-label=${this.localize("calendar.next_month")}
          ?disabled=${!this._canMoveMonth(1, oldestKey, todayKey)}
          @click=${() => this._moveMonth(1)}
        >
          ${renderIcon("chevronRight")}
        </button>
      </header>
      <div class="weekdays" aria-hidden="true">
        ${this._weekdayLabels().map(
          (label) => html`<span class="weekday">${label}</span>`,
        )}
      </div>
      <div class="days">
        ${cells.map((day) => {
          if (!day) return html`<span class="blank"></span>`;
          const key = dateKey(
            this._visibleMonth.year,
            this._visibleMonth.month,
            day,
          );
          const marked = markedDates.has(key);
          const selected = key === this._selectedDate;
          return html`<button
            class=${`day${marked ? " marked" : ""}${selected ? " selected" : ""}`}
            type="button"
            aria-label=${this._dayLabel(key, marked)}
            aria-pressed=${selected ? "true" : "false"}
            ?disabled=${key < oldestKey || key > todayKey}
            @click=${() => this._select(key)}
          >
            ${day}
          </button>`;
        })}
      </div>
      <footer class="footer">
        <button
          class="reset"
          type="button"
          ?disabled=${!this._selectedDate}
          @click=${this._reset}
        >
          ${this.localize("calendar.reset")}
        </button>
      </footer>
    </section>`;
  }

  private readonly _toggle = (): void => {
    this._open = !this._open;
    if (this._open) {
      this._visibleMonth = monthFromKey(this._selectedDate ?? this._todayKey());
    }
  };

  private _select(key: string): void {
    const entityId = this._activeEntityId;
    if (entityId) this.dateContext?.select(entityId, key);
    this._open = false;
  }

  private readonly _reset = (): void => {
    const entityId = this._activeEntityId;
    if (entityId) this.dateContext?.reset(entityId);
    this._open = false;
  };

  private _moveMonth(offset: number): void {
    const value = new Date(
      Date.UTC(this._visibleMonth.year, this._visibleMonth.month + offset, 1),
    );
    this._visibleMonth = {
      month: value.getUTCMonth(),
      year: value.getUTCFullYear(),
    };
  }

  private _canMoveMonth(
    offset: number,
    oldestKey: string,
    todayKey: string,
  ): boolean {
    const value = new Date(
      Date.UTC(this._visibleMonth.year, this._visibleMonth.month + offset, 1),
    );
    const first = dateKey(value.getUTCFullYear(), value.getUTCMonth(), 1);
    const last = dateKey(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      daysInMonth(value.getUTCFullYear(), value.getUTCMonth()),
    );
    return last >= oldestKey && first <= todayKey;
  }

  private _monthTitle(): string {
    return abstractDateFormatter(this.api?.locale, {
      month: "long",
      year: "numeric",
    }).format(
      new Date(Date.UTC(this._visibleMonth.year, this._visibleMonth.month, 15)),
    );
  }

  private _weekdayLabels(): readonly string[] {
    const first = this._firstWeekday();
    const formatter = abstractDateFormatter(this.api?.locale, {
      weekday: "short",
    });
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(Date.UTC(2024, 0, 7 + ((first + index) % 7)))),
    );
  }

  private _dayLabel(key: string, marked: boolean): string {
    const [year = 0, month = 1, day = 1] = key.split("-").map(Number);
    const label = abstractDateFormatter(this.api?.locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(Date.UTC(year, month - 1, day)));
    return marked
      ? this.localize(
          this.mode === "recordings"
            ? "recordings.day_with_recordings"
            : "calendar.day_with_activity",
          { date: label },
        )
      : label;
  }

  private _firstWeekday(): number {
    const configured = this.api?.locale?.first_weekday;
    if (configured === "monday") return 1;
    if (configured === "saturday") return 6;
    return 0;
  }

  private _todayKey(): string {
    return homeAssistantDateKey(Date.now() / 1000, this.api?.locale);
  }

  private _syncCameraSelection(): void {
    if (
      this.cameraSelection === this._subscribedCameraSelection &&
      this.targetModuleId === this._subscribedTargetModuleId
    ) {
      return;
    }
    this._unsubscribeCameraSelection?.();
    this._subscribedCameraSelection = this.cameraSelection;
    this._subscribedTargetModuleId = this.targetModuleId;
    this._activeEntityId = undefined;
    if (this.cameraSelection && this.targetModuleId) {
      this._unsubscribeCameraSelection = this.cameraSelection.subscribe(
        this.targetModuleId,
        ({ activeEntityId, settled }) => {
          if (settled === false || activeEntityId === this._activeEntityId) {
            return;
          }
          this._activeEntityId = activeEntityId;
          this.requestUpdate();
        },
      );
    }
  }

  private readonly _handleDocumentPointerDown = (event: PointerEvent): void => {
    if (!this._open || event.composedPath().includes(this)) return;
    this._open = false;
  };

  private readonly _handleDocumentKeyDown = (event: KeyboardEvent): void => {
    if (!this._open || event.key !== "Escape") return;
    this._open = false;
    this.shadowRoot
      ?.querySelector<HTMLButtonElement>(".calendar-trigger")
      ?.focus();
  };

  static styles = activityCalendarStyles;
}

function abstractDateFormatter(
  locale: HomeAssistantLocale | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale?.language, {
      ...options,
      timeZone: "UTC",
    });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" });
  }
}

function monthFromKey(key: string): CalendarMonth {
  const [year = 1970, month = 1] = key.split("-").map(Number);
  return { month: month - 1, year };
}

function dateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function calendarCells(
  month: CalendarMonth,
  firstWeekday: number,
): readonly (number | undefined)[] {
  const leading =
    (new Date(Date.UTC(month.year, month.month, 1)).getUTCDay() -
      firstWeekday +
      7) %
    7;
  return [
    ...Array.from({ length: leading }, () => undefined),
    ...Array.from(
      { length: daysInMonth(month.year, month.month) },
      (_, index) => index + 1,
    ),
  ];
}

if (!customElements.get(ACTIVITY_CALENDAR_TAG)) {
  customElements.define(ACTIVITY_CALENDAR_TAG, ActivityCalendar);
}

declare global {
  interface HTMLElementTagNameMap {
    [ACTIVITY_CALENDAR_TAG]: ActivityCalendar;
  }
}
