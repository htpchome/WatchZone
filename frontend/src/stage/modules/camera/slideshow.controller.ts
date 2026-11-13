import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { SlideAdvanceSeconds } from "../../../core/config";

interface CameraSlideshowContext {
  readonly advance: () => void;
  readonly intervalSeconds: SlideAdvanceSeconds;
  readonly itemCount: number;
}

/** Owns slideshow timing and takeover holds without owning camera selection. */
export class CameraSlideshowController implements ReactiveController {
  public enabled = false;
  public held = false;
  public remainingSeconds = 10;

  private _connected = false;
  private _deadline = 0;
  private _intervalSeconds: SlideAdvanceSeconds = 10;
  private _itemCount = 0;
  private _timer?: number;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _context: () => CameraSlideshowContext,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    this._connected = true;
    this._syncContext();
    if (this.enabled && !this.held) this._restartCountdown();
  }

  public hostUpdate(): void {
    this._syncContext();
  }

  public hostDisconnected(): void {
    this._connected = false;
    this._clearTimer();
  }

  public toggle(): void {
    if (this._itemCount <= 1) return;
    if (this.enabled && this.held) {
      this.held = false;
      this._advanceAndRestart();
      return;
    }
    this.enabled = !this.enabled;
    this.held = false;
    if (this.enabled) this._restartCountdown();
    else this._clearTimer();
    this._host.requestUpdate();
  }

  public hold(): void {
    if (!this.enabled || this.held) return;
    this.held = true;
    this._clearTimer();
    this._host.requestUpdate();
  }

  public resumeAfterTakeover(): boolean {
    if (!this.enabled || !this.held) return false;
    this.held = false;
    this._advanceAndRestart();
    return true;
  }

  public manualSelection(): void {
    if (!this.enabled) return;
    this.held = false;
    this._restartCountdown();
    this._host.requestUpdate();
  }

  private _syncContext(): void {
    const context = this._context();
    const intervalChanged = context.intervalSeconds !== this._intervalSeconds;
    this._intervalSeconds = context.intervalSeconds;
    this._itemCount = context.itemCount;
    if (this._itemCount <= 1) {
      if (this.enabled || this.held || this._timer !== undefined) {
        this.enabled = false;
        this.held = false;
        this._clearTimer();
      }
      this.remainingSeconds = this._intervalSeconds;
      return;
    }
    if (intervalChanged) {
      this.remainingSeconds = this._intervalSeconds;
      if (this.enabled && !this.held) this._restartCountdown();
    }
  }

  private _advanceAndRestart(): void {
    this._context().advance();
    this._restartCountdown();
    this._host.requestUpdate();
  }

  private _restartCountdown(): void {
    this._clearTimer();
    this.remainingSeconds = this._intervalSeconds;
    if (!this._connected || !this.enabled || this.held) return;
    this._deadline = Date.now() + this._intervalSeconds * 1_000;
    this._timer = window.setTimeout(this._tick, 1_000);
  }

  private readonly _tick = (): void => {
    this._timer = undefined;
    if (!this._connected || !this.enabled || this.held) return;
    const remaining = Math.max(
      0,
      Math.ceil((this._deadline - Date.now()) / 1_000),
    );
    if (remaining === 0) {
      this._advanceAndRestart();
      return;
    }
    if (remaining !== this.remainingSeconds) {
      this.remainingSeconds = remaining;
      this._host.requestUpdate();
    }
    this._timer = window.setTimeout(this._tick, 1_000);
  };

  private _clearTimer(): void {
    if (this._timer !== undefined) window.clearTimeout(this._timer);
    this._timer = undefined;
    this._deadline = 0;
  }
}
