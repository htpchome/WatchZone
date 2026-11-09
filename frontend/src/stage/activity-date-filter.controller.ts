import type { ReactiveController, ReactiveControllerHost } from "lit";

import { homeAssistantDateKey } from "../core/date-time";
import type { HomeAssistantLocale } from "../core/home-assistant";
import type { ActivityDateFilterContext } from "./activity-date-filter-context";

/** Makes the shared activity date selection reactive inside a placeable. */
export class ActivityDateFilterController implements ReactiveController {
  public selectedDate?: string;

  private _connected = false;
  private _subscribedContext?: ActivityDateFilterContext;
  private _unsubscribe?: () => void;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _context: () => ActivityDateFilterContext | undefined,
    private readonly _locale: () => HomeAssistantLocale | undefined,
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
    this._subscribedContext = undefined;
  }

  public hostUpdated(): void {
    this._syncContext();
  }

  public includes(timestampSeconds: number): boolean {
    return (
      !this.selectedDate ||
      homeAssistantDateKey(timestampSeconds, this._locale()) ===
        this.selectedDate
    );
  }

  private _syncContext(): void {
    if (!this._connected) return;
    const context = this._context();
    if (context === this._subscribedContext) return;
    this._unsubscribe?.();
    this._subscribedContext = context;
    this._unsubscribe = context?.subscribe(({ selectedDate }) => {
      if (selectedDate === this.selectedDate) return;
      this.selectedDate = selectedDate;
      this._host.requestUpdate();
    });
  }
}
