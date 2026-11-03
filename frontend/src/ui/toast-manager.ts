import type { ReactiveController, ReactiveControllerHost } from "lit";

import {
  APP_ID,
  TOAST_TRANSITION_DURATION_MS,
  TOAST_VISIBLE_DURATION_MS,
} from "../core/constants";
import type { IconName } from "./icons";

export type ToastSeverity = "error" | "success" | "warning";

export interface ToastNotice {
  readonly dismissing: boolean;
  readonly id: string;
  readonly icon?: IconName;
  readonly message: string;
  readonly severity: ToastSeverity;
}

export interface ToastOptions {
  readonly durationMs?: number;
  readonly icon?: IconName;
  readonly key?: string;
  readonly persistent?: boolean;
}

interface ToastTimers {
  dismiss?: ReturnType<typeof setTimeout>;
  remove?: ReturnType<typeof setTimeout>;
}

/** Owns toast identity, replacement, timing, and lifecycle cleanup. */
export class ToastManager implements ReactiveController {
  private _notices: readonly ToastNotice[] = [];
  private _sequence = 0;
  private readonly _timers = new Map<string, ToastTimers>();

  public constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  public get notices(): readonly ToastNotice[] {
    return this._notices;
  }

  public error(message: string, options?: ToastOptions): string {
    return this.show("error", message, options);
  }

  public success(message: string, options?: ToastOptions): string {
    return this.show("success", message, options);
  }

  public warning(message: string, options?: ToastOptions): string {
    return this.show("warning", message, options);
  }

  public show(
    severity: ToastSeverity,
    message: string,
    options: ToastOptions = {},
  ): string {
    const id = options.key ?? `${APP_ID}-toast-${++this._sequence}`;
    this._clearTimers(id);
    const notice: ToastNotice = {
      dismissing: false,
      id,
      icon: options.icon,
      message,
      severity,
    };
    const existingIndex = this._notices.findIndex((item) => item.id === id);
    this._notices =
      existingIndex === -1
        ? [...this._notices, notice]
        : this._notices.map((item, index) =>
            index === existingIndex ? notice : item,
          );
    this._host.requestUpdate();

    if (!options.persistent) {
      const durationMs = options.durationMs ?? TOAST_VISIBLE_DURATION_MS;
      const timers: ToastTimers = {
        dismiss: setTimeout(() => this.dismiss(id), durationMs),
      };
      this._timers.set(id, timers);
    }
    return id;
  }

  public dismiss(id: string): void {
    const notice = this._notices.find((item) => item.id === id);
    if (!notice || notice.dismissing) return;
    this._clearTimers(id);
    this._notices = this._notices.map((item) =>
      item.id === id ? { ...item, dismissing: true } : item,
    );
    this._host.requestUpdate();
    const timers: ToastTimers = {
      remove: setTimeout(() => this._remove(id), TOAST_TRANSITION_DURATION_MS),
    };
    this._timers.set(id, timers);
  }

  public hostDisconnected(): void {
    for (const id of this._timers.keys()) this._clearTimers(id);
    this._notices = [];
  }

  private _remove(id: string): void {
    this._clearTimers(id);
    this._notices = this._notices.filter((item) => item.id !== id);
    this._host.requestUpdate();
  }

  private _clearTimers(id: string): void {
    const timers = this._timers.get(id);
    if (!timers) return;
    if (timers.dismiss) clearTimeout(timers.dismiss);
    if (timers.remove) clearTimeout(timers.remove);
    this._timers.delete(id);
  }
}
