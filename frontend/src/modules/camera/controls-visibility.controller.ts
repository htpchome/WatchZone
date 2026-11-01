import type { ReactiveController, ReactiveControllerHost } from "lit";

import { CAMERA_CONTROLS_HIDE_DELAY_MS } from "../../core/constants";

/** Owns transient pointer visibility without coupling timers to rendering. */
export class CameraControlsVisibilityController implements ReactiveController {
  public visible = false;

  private _focused = false;
  private _hideTimer?: ReturnType<typeof setTimeout>;
  private _hovered = false;
  private _pointerFocusPending = false;

  public constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  public hostDisconnected(): void {
    this._clearHideTimer();
    this._focused = false;
    this._hovered = false;
    this.visible = false;
  }

  public readonly handlePointerEnter = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    this._hovered = true;
    this._show();
  };

  public readonly handlePointerLeave = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    this._hovered = false;
    this._scheduleHide();
  };

  public readonly handlePointerDown = (event: PointerEvent): void => {
    // Pointer-origin focus must not pin the overlay open after pointer exit.
    this._focused = false;
    this._pointerFocusPending = true;
    queueMicrotask(() => {
      this._pointerFocusPending = false;
    });
    this._show();
    if (event.pointerType === "touch") this._scheduleHide();
  };

  public readonly handleFocusIn = (): void => {
    if (this._pointerFocusPending) return;
    this._focused = true;
    this._show();
  };

  public readonly handleFocusOut = (event: FocusEvent): void => {
    const container = event.currentTarget as Node | null;
    if (container?.contains(event.relatedTarget as Node | null)) return;
    this._focused = false;
    this._scheduleHide();
  };

  private _show(): void {
    this._clearHideTimer();
    if (this.visible) return;
    this.visible = true;
    this._host.requestUpdate();
  }

  private _scheduleHide(): void {
    this._clearHideTimer();
    if (this._hovered || this._focused) return;
    this._hideTimer = setTimeout(() => {
      this._hideTimer = undefined;
      if (this._hovered || this._focused || !this.visible) return;
      this.visible = false;
      this._host.requestUpdate();
    }, CAMERA_CONTROLS_HIDE_DELAY_MS);
  }

  private _clearHideTimer(): void {
    if (this._hideTimer === undefined) return;
    clearTimeout(this._hideTimer);
    this._hideTimer = undefined;
  }
}
