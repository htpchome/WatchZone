import type { ReactiveController, ReactiveControllerHost } from "lit";

/** Owns one transient visibility state and guarantees timer cleanup. */
export class TimedVisibilityController implements ReactiveController {
  public visible = false;

  private _hideTimer?: ReturnType<typeof setTimeout>;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _defaultDurationMs: number,
  ) {
    _host.addController(this);
  }

  public hostDisconnected(): void {
    this.reset();
  }

  public reveal(): void {
    this.cancelScheduledHide();
    this._setVisible(true);
  }

  public revealFor(durationMs = this._defaultDurationMs): void {
    this.reveal();
    this.scheduleHide(durationMs);
  }

  public scheduleHide(durationMs = this._defaultDurationMs): void {
    this.cancelScheduledHide();
    this._hideTimer = setTimeout(() => {
      this._hideTimer = undefined;
      this._setVisible(false);
    }, durationMs);
  }

  public cancelScheduledHide(): void {
    if (this._hideTimer === undefined) return;
    clearTimeout(this._hideTimer);
    this._hideTimer = undefined;
  }

  public hide(): void {
    this.cancelScheduledHide();
    this._setVisible(false);
  }

  public reset(): void {
    this.cancelScheduledHide();
    this._setVisible(false);
  }

  private _setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this._host.requestUpdate();
  }
}
