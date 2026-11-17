import type { ReactiveController, ReactiveControllerHost } from "lit";

import { THUMBNAIL_PREVIEW_LONG_PRESS_MS } from "../core/constants";

const MOVE_TOLERANCE_PX = 10;

interface ThumbnailPreviewPressCallbacks<Key> {
  activate(key: Key): void;
  deactivate(key: Key): void;
}

/** Converts a stationary touch hold into the existing thumbnail-preview state. */
export class ThumbnailPreviewPressController<
  Key,
> implements ReactiveController {
  private _active = false;
  private _key?: Key;
  private _pointerId?: number;
  private _startX = 0;
  private _startY = 0;
  private _suppressClickKey?: Key;
  private _suppressClickTimer?: ReturnType<typeof setTimeout>;
  private _timer?: ReturnType<typeof setTimeout>;

  public constructor(
    host: ReactiveControllerHost,
    private readonly _callbacks: ThumbnailPreviewPressCallbacks<Key>,
  ) {
    host.addController(this);
  }

  public hostDisconnected(): void {
    this.cancel();
    this._clearClickSuppression();
  }

  public start(event: PointerEvent, key: Key): void {
    if (
      event.pointerType !== "touch" ||
      !event.isPrimary ||
      event.button !== 0
    ) {
      return;
    }
    this.cancel();
    this._clearClickSuppression();
    this._key = key;
    this._pointerId = event.pointerId;
    this._startX = event.clientX;
    this._startY = event.clientY;
    this._timer = setTimeout(() => {
      if (this._key !== key || this._pointerId !== event.pointerId) return;
      this._timer = undefined;
      this._active = true;
      this._callbacks.activate(key);
    }, THUMBNAIL_PREVIEW_LONG_PRESS_MS);
    this._listen();
  }

  public move(event: PointerEvent): void {
    if (event.pointerId !== this._pointerId) return;
    const deltaX = event.clientX - this._startX;
    const deltaY = event.clientY - this._startY;
    if (
      deltaX * deltaX + deltaY * deltaY >
      MOVE_TOLERANCE_PX * MOVE_TOLERANCE_PX
    ) {
      this.cancel();
    }
  }

  public end(event: PointerEvent): void {
    if (event.pointerId !== this._pointerId) return;
    this._finish(this._active);
  }

  public cancel(): void {
    this._finish(false);
  }

  public preventContextMenu(event: Event): void {
    if (this._key === undefined) return;
    event.preventDefault();
  }

  public consumeClick(key: Key): boolean {
    if (this._suppressClickKey !== key) return false;
    this._clearClickSuppression();
    return true;
  }

  private _finish(suppressClick: boolean): void {
    const key = this._key;
    const active = this._active;
    if (this._timer !== undefined) clearTimeout(this._timer);
    this._timer = undefined;
    this._active = false;
    this._key = undefined;
    this._pointerId = undefined;
    this._unlisten();
    if (active && key !== undefined) this._callbacks.deactivate(key);
    if (!suppressClick || key === undefined) return;
    this._suppressClickKey = key;
    this._suppressClickTimer = setTimeout(
      () => this._clearClickSuppression(),
      0,
    );
  }

  private _clearClickSuppression(): void {
    if (this._suppressClickTimer !== undefined)
      clearTimeout(this._suppressClickTimer);
    this._suppressClickTimer = undefined;
    this._suppressClickKey = undefined;
  }

  private _listen(): void {
    window.addEventListener("blur", this._cancelFromEnvironment);
    window.addEventListener("pointercancel", this._endFromWindow);
    window.addEventListener("pointerup", this._endFromWindow);
    document.addEventListener("visibilitychange", this._cancelFromEnvironment);
  }

  private _unlisten(): void {
    window.removeEventListener("blur", this._cancelFromEnvironment);
    window.removeEventListener("pointercancel", this._endFromWindow);
    window.removeEventListener("pointerup", this._endFromWindow);
    document.removeEventListener(
      "visibilitychange",
      this._cancelFromEnvironment,
    );
  }

  private readonly _cancelFromEnvironment = (): void => {
    if (document.visibilityState === "visible" && document.hasFocus()) return;
    this.cancel();
  };

  private readonly _endFromWindow = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) return;
    if (event.type === "pointercancel") this.cancel();
    else this.end(event);
  };
}
