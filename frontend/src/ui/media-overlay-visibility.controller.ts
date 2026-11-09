import type { ReactiveController, ReactiveControllerHost } from "lit";

export const MEDIA_OVERLAY_HIDE_DELAY_MS = 2500;

export interface MediaOverlayVisibilityOptions {
  readonly onVisibilityChange?: (visible: boolean) => void;
}

/** Owns transient pointer visibility without coupling timers to rendering. */
export class MediaOverlayVisibilityController implements ReactiveController {
  public sourceVisible = false;
  public visible = false;

  private _focused = false;
  private _holds = 0;
  private _hideTimer?: ReturnType<typeof setTimeout>;
  private _hovered = false;
  private _interactionRoot?: HTMLElement;
  private _pointerFocusPending = false;
  private _suppressed = false;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _options: MediaOverlayVisibilityOptions = {},
  ) {
    _host.addController(this);
  }

  public hostDisconnected(): void {
    this._clearHideTimer();
    this._focused = false;
    this._hovered = false;
    this._holds = 0;
    this._pointerFocusPending = false;
    this._suppressed = false;
    this.sourceVisible = false;
    this.visible = false;
    this._options.onVisibilityChange?.(false);
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

  public hide(): void {
    this._clearHideTimer();
    if (!this.visible && !this.sourceVisible) return;
    this.visible = false;
    this.sourceVisible = false;
    this._options.onVisibilityChange?.(false);
    this._host.requestUpdate();
  }

  public setSuppressed(suppressed: boolean): void {
    this._suppressed = suppressed;
    if (suppressed) this.hide();
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
    this._interactionRoot = event.currentTarget as HTMLElement;
    // Pointer-origin focus must not pin the overlay open after pointer exit.
    this._focused = false;
    this._pointerFocusPending = true;
    if (event.pointerType === "touch") {
      if (this.visible) this.hide();
      else {
        this._show();
        this._scheduleHide();
      }
      return;
    }
    queueMicrotask(() => {
      this._pointerFocusPending = false;
    });
    this._show();
  };

  public readonly handlePointerEnd = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") return;
    this._interactionRoot?.blur();
    setTimeout(() => {
      this._pointerFocusPending = false;
    }, 0);
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
    if (this._suppressed) return;
    this._clearHideTimer();
    if (this.visible && this.sourceVisible) return;
    this.visible = true;
    this.sourceVisible = true;
    this._options.onVisibilityChange?.(true);
    this._host.requestUpdate();
  }

  private _scheduleHide(): void {
    this._clearHideTimer();
    if (this._hovered || this._focused || this._holds > 0) return;
    this._hideTimer = setTimeout(() => {
      this._hideTimer = undefined;
      if (this._hovered || this._focused || this._holds > 0) {
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
