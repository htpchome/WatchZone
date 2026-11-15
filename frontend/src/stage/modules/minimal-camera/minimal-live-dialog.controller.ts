import type { ReactiveController, ReactiveControllerHost } from "lit";

interface MinimalLiveDialogCallbacks {
  getAspectRatio(): number;
  getChromeHeight(): number;
  getDialog(): HTMLDialogElement | null;
}

/** Owns minimal live-dialog visibility, drag, resize, and viewport clamping. */
export class MinimalLiveDialogController implements ReactiveController {
  public openState = false;
  private _drag?: {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly pointerId: number;
  };
  private _resize?: {
    readonly pointerId: number;
    readonly startWidth: number;
    readonly startX: number;
    readonly startY: number;
  };
  private _resizeFrame?: number;
  private _resizeWidth?: number;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _callbacks: MinimalLiveDialogCallbacks,
  ) {
    _host.addController(this);
  }

  public hostDisconnected(): void {
    this._cleanup();
  }

  public open(): void {
    if (this.openState) return;
    this.openState = true;
    this._host.requestUpdate();
  }

  public close = (event?: Event): void => {
    event?.preventDefault();
    this._cleanup();
    const dialog = this._callbacks.getDialog();
    if (dialog?.open) dialog.close();
    else this._finishClose();
  };

  public handleClosed = (): void => this._finishClose();

  public handleBackdropClick = (event: MouseEvent): void => {
    if (event.target === event.currentTarget) this.close(event);
  };

  public sync(): void {
    const dialog = this._callbacks.getDialog();
    if (!dialog) return;
    if (this.openState && !dialog.open) {
      dialog.classList.remove("dragged");
      for (const property of ["left", "top", "width"]) {
        dialog.style.removeProperty(property);
      }
      dialog.showModal();
      window.addEventListener("resize", this._clamp);
    } else if (!this.openState && dialog.open) dialog.close();
  }

  public startDrag = (event: PointerEvent): void => {
    if (
      event.button !== 0 ||
      event.composedPath().some((target) => target instanceof HTMLButtonElement)
    )
      return;
    const dialog = this._callbacks.getDialog();
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    this._prepareManualBounds(rect);
    this._drag = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      pointerId: event.pointerId,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  public moveDrag = (event: PointerEvent): void => {
    const drag = this._drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this._position(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  };

  public endDrag = (event: PointerEvent): void => {
    if (!this._drag || event.pointerId !== this._drag.pointerId) return;
    this._drag = undefined;
    releasePointer(event);
  };

  public startResize = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const dialog = this._callbacks.getDialog();
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    this._prepareManualBounds(rect);
    this._resize = {
      pointerId: event.pointerId,
      startWidth: rect.width,
      startX: event.clientX,
      startY: event.clientY,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  public moveResize = (event: PointerEvent): void => {
    const resize = this._resize;
    if (!resize || event.pointerId !== resize.pointerId) return;
    this._resizeWidth =
      resize.startWidth +
      (event.clientX -
        resize.startX +
        (event.clientY - resize.startY) * this._callbacks.getAspectRatio()) /
        2;
    if (this._resizeFrame !== undefined) return;
    this._resizeFrame = requestAnimationFrame(() => {
      this._resizeFrame = undefined;
      const width = this._resizeWidth;
      this._resizeWidth = undefined;
      if (width !== undefined) this._setWidth(width);
    });
  };

  public endResize = (event: PointerEvent): void => {
    if (!this._resize || event.pointerId !== this._resize.pointerId) return;
    this._flushResize();
    this._resize = undefined;
    releasePointer(event);
  };

  public handleResizeKey = (event: KeyboardEvent): void => {
    const direction =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!direction) return;
    event.preventDefault();
    const dialog = this._callbacks.getDialog();
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    this._prepareManualBounds(rect);
    this._setWidth(rect.width + direction * (event.shiftKey ? 32 : 16));
  };

  private _finishClose(): void {
    this._cleanup();
    if (!this.openState) return;
    this.openState = false;
    this._host.requestUpdate();
  }

  private _prepareManualBounds(rect: DOMRect): void {
    const dialog = this._callbacks.getDialog();
    if (!dialog) return;
    dialog.classList.add("dragged");
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    dialog.style.width = `${rect.width}px`;
  }

  private _setWidth(width: number): void {
    const dialog = this._callbacks.getDialog();
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const maxWidth = Math.max(
      1,
      Math.min(
        viewportWidth - Math.max(8, rect.left) - 8,
        (viewportHeight -
          Math.max(8, rect.top) -
          this._callbacks.getChromeHeight() -
          8) *
          this._callbacks.getAspectRatio(),
      ),
    );
    const minWidth = Math.min(240, maxWidth);
    dialog.style.width = `${Math.min(Math.max(minWidth, width), maxWidth)}px`;
    if (dialog.classList.contains("dragged")) {
      this._position(rect.left, rect.top);
    }
  }

  private _position(left: number, top: number): void {
    const dialog = this._callbacks.getDialog();
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    dialog.style.left = `${Math.min(Math.max(0, left), Math.max(0, viewportWidth - rect.width))}px`;
    dialog.style.top = `${Math.min(Math.max(0, top), Math.max(0, viewportHeight - rect.height))}px`;
  }

  private readonly _clamp = (): void => {
    const dialog = this._callbacks.getDialog();
    if (!dialog?.open) return;
    const rect = dialog.getBoundingClientRect();
    this._setWidth(rect.width);
    if (dialog.classList.contains("dragged")) {
      this._position(rect.left, rect.top);
    }
  };

  private _flushResize(): void {
    if (this._resizeFrame !== undefined) {
      cancelAnimationFrame(this._resizeFrame);
      this._resizeFrame = undefined;
    }
    const width = this._resizeWidth;
    this._resizeWidth = undefined;
    if (width !== undefined) this._setWidth(width);
  }

  private _cleanup(): void {
    window.removeEventListener("resize", this._clamp);
    this._drag = undefined;
    this._resize = undefined;
    if (this._resizeFrame !== undefined) {
      cancelAnimationFrame(this._resizeFrame);
      this._resizeFrame = undefined;
    }
    this._resizeWidth = undefined;
  }
}

function releasePointer(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId);
  }
}
