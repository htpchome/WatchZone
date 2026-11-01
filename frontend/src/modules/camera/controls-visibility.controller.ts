import type { ReactiveController, ReactiveControllerHost } from "lit";

import { TimedVisibilityController } from "../../ui/timed-visibility.controller";
import { CAMERA_OVERLAY_HIDE_DELAY_MS } from "./constants";

/** Owns transient pointer visibility without coupling timers to rendering. */
export class CameraControlsVisibilityController implements ReactiveController {
  private _focused = false;
  private _hovered = false;
  private _pointerFocusPending = false;
  private readonly _visibility: TimedVisibilityController;

  public constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
    this._visibility = new TimedVisibilityController(
      _host,
      CAMERA_OVERLAY_HIDE_DELAY_MS,
    );
  }

  public get visible(): boolean {
    return this._visibility.visible;
  }

  public hostDisconnected(): void {
    this._visibility.reset();
    this._focused = false;
    this._hovered = false;
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
    this._visibility.reveal();
  }

  private _scheduleHide(): void {
    this._visibility.cancelScheduledHide();
    if (this._hovered || this._focused) return;
    this._visibility.scheduleHide();
  }
}
