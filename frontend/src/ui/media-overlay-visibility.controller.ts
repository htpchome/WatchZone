import type { ReactiveController, ReactiveControllerHost } from "lit";

export const MEDIA_OVERLAY_HIDE_DELAY_MS = 2500;

export interface MediaOverlayVisibilityOptions {
  readonly onVisibilityChange?: (visible: boolean) => void;
}

/** Owns transient pointer visibility without coupling timers to rendering. */
export class MediaOverlayVisibilityController implements ReactiveController {
  public sourceVisible = false;
  public visible = false;

  private _active = true;
  private _focused = false;
  private readonly _holds = new Set<symbol>();
  private _hideTimer?: ReturnType<typeof setTimeout>;
  private _hovered = false;
  private _interactionRoot?: HTMLElement;
  private _pointerFocusPending = false;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _options: MediaOverlayVisibilityOptions = {},
  ) {
    _host.addController(this);
  }

  public hostDisconnected(): void {
    this.setActive(false);
  }

  /** Clears transient interaction whenever presentation ownership changes. */
  public setActive(active: boolean): void {
    if (this._active === active) return;
    this._active = active;
    this._clearHideTimer();
    this._focused = false;
    this._hovered = false;
    this._holds.clear();
    this._interactionRoot = undefined;
    this._pointerFocusPending = false;
    if (!active) this.hide();
  }

  public revealSource(): void {
    if (!this._active) return;
    this._clearHideTimer();
    this.sourceVisible = true;
    this._host.requestUpdate();
    this._scheduleHide();
  }

  public reveal(): void {
    this._show();
    this._scheduleHide();
  }

  public hide(): void {
    this._clearHideTimer();
    if (!this.visible && !this.sourceVisible) return;
    this.visible = false;
    this.sourceVisible = false;
    this._options.onVisibilityChange?.(false);
    this._host.requestUpdate();
  }

  public hold(): () => void {
    if (!this._active) return () => undefined;
    const hold = Symbol("media-overlay-hold");
    this._holds.add(hold);
    this._show();
    return () => {
      if (!this._holds.delete(hold)) return;
      this._scheduleHide();
    };
  }

  public readonly handlePointerEnter = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    this._interactionRoot = event.currentTarget as HTMLElement;
    this._hovered = true;
    this._show();
  };

  public readonly handlePointerLeave = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    this._hovered = false;
    this._scheduleHide();
  };

  public readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    this._interactionRoot = event.currentTarget as HTMLElement;
    this._hovered = true;
    this._show();
  };

  public readonly handlePointerDown = (event: PointerEvent): void => {
    // Touch interpretation is centralized by MediaTouchGestureController.
    // This controller owns visibility policy and its timer, not gestures.
    if (event.pointerType === "touch") return;
    this._interactionRoot = event.currentTarget as HTMLElement;
    // Pointer-origin focus must not pin the overlay open after pointer exit.
    this._focused = false;
    this._pointerFocusPending = true;
    queueMicrotask(() => {
      this._pointerFocusPending = false;
    });
    this._show();
  };

  public readonly handlePointerEnd = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
  };

  public readonly handleFocusIn = (event: FocusEvent): void => {
    if (this._pointerFocusPending) return;
    const target = event.target;
    // Only keyboard-visible focus may hold an overlay. Pointer-created focus
    // is deliberately transient, especially on touch browsers.
    if (target instanceof HTMLElement && !target.matches(":focus-visible")) {
      return;
    }
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
    if (!this._active) return;
    this._clearHideTimer();
    if (this.visible && this.sourceVisible) return;
    this.visible = true;
    this.sourceVisible = true;
    this._options.onVisibilityChange?.(true);
    this._host.requestUpdate();
  }

  private _scheduleHide(): void {
    this._clearHideTimer();
    if (this._hovered || this._focused || this._holds.size > 0) return;
    this._hideTimer = setTimeout(() => {
      this._hideTimer = undefined;
      if (this._hovered || this._focused || this._holds.size > 0) {
        return;
      }
      this.visible = false;
      this.sourceVisible = false;
      this._options.onVisibilityChange?.(false);
      this._host.requestUpdate();
    }, MEDIA_OVERLAY_HIDE_DELAY_MS);
  }

  private _clearHideTimer(): void {
    if (this._hideTimer === undefined) return;
    clearTimeout(this._hideTimer);
    this._hideTimer = undefined;
  }
}
