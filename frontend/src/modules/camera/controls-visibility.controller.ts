import type { ReactiveController, ReactiveControllerHost } from "lit";

import { CAMERA_OVERLAY_HIDE_DELAY_MS } from "./constants";

/** Owns transient pointer visibility without coupling timers to rendering. */
export class CameraControlsVisibilityController implements ReactiveController {
  public sourceVisible = false;
  public visible = false;

  private _focused = false;
  private _holds = 0;
  private _hideTimer?: ReturnType<typeof setTimeout>;
  private _honorHoverPseudo = false;
  private _hovered = false;
  private _interactionRoot?: HTMLElement;
  private _pointerFocusPending = false;
  private _pointerFocusResetTimer?: ReturnType<typeof setTimeout>;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _onVisibilityChange?: (visible: boolean) => void,
  ) {
    _host.addController(this);
  }

  public hostDisconnected(): void {
    this._clearHideTimer();
    this._clearPointerFocusReset();
    this._focused = false;
    this._honorHoverPseudo = false;
    this._hovered = false;
    this._holds = 0;
    this._pointerFocusPending = false;
    this.sourceVisible = false;
    this.visible = false;
    this._onVisibilityChange?.(false);
  }

  public revealSource(): void {
    this._clearHideTimer();
    this.sourceVisible = true;
    this._host.requestUpdate();
    this._scheduleHide();
  }

  public reveal(): void {
    this._show();
    this._scheduleHide();
  }

  public hold(): () => void {
    this._holds += 1;
    this._show();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this._holds = Math.max(0, this._holds - 1);
      this._scheduleHide();
    };
  }

  public readonly handlePointerEnter = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    this._interactionRoot = event.currentTarget as HTMLElement;
    this._honorHoverPseudo = true;
    this._hovered = true;
    this._show();
  };

  public readonly handlePointerLeave = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    this._hovered = false;
    this._honorHoverPseudo = false;
    this._scheduleHide();
  };

  public readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    this._interactionRoot = event.currentTarget as HTMLElement;
    this._honorHoverPseudo = true;
    this._hovered = true;
    this._show();
  };

  public readonly handlePointerDown = (event: PointerEvent): void => {
    this._interactionRoot = event.currentTarget as HTMLElement;
    if (event.pointerType === "touch") {
      this._hovered = false;
      this._honorHoverPseudo = false;
    }
    // Pointer-origin focus must not pin the overlay open after pointer exit.
    this._focused = false;
    this._pointerFocusPending = true;
    this._clearPointerFocusReset();
    this._show();
    if (event.pointerType === "touch") this._scheduleHide();
  };

  public readonly handlePointerEnd = (): void => {
    this._clearPointerFocusReset();
    this._pointerFocusResetTimer = setTimeout(() => {
      this._pointerFocusResetTimer = undefined;
      this._pointerFocusPending = false;
    });
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
    if (this.visible && this.sourceVisible) return;
    this.visible = true;
    this.sourceVisible = true;
    this._onVisibilityChange?.(true);
    this._host.requestUpdate();
  }

  private _scheduleHide(): void {
    this._clearHideTimer();
    if (this._hovered || this._focused || this._holds > 0) return;
    this._hideTimer = setTimeout(() => {
      this._hideTimer = undefined;
      if (
        this._hovered ||
        this._focused ||
        this._holds > 0 ||
        (this._honorHoverPseudo && this._interactionRoot?.matches(":hover"))
      ) {
        return;
      }
      this.visible = false;
      this.sourceVisible = false;
      this._onVisibilityChange?.(false);
      this._host.requestUpdate();
    }, CAMERA_OVERLAY_HIDE_DELAY_MS);
  }

  private _clearHideTimer(): void {
    if (this._hideTimer === undefined) return;
    clearTimeout(this._hideTimer);
    this._hideTimer = undefined;
  }

  private _clearPointerFocusReset(): void {
    if (this._pointerFocusResetTimer === undefined) return;
    clearTimeout(this._pointerFocusResetTimer);
    this._pointerFocusResetTimer = undefined;
  }
}
