import type { ReactiveController, ReactiveControllerHost } from "lit";

const DEFAULT_HEIGHT_RATIO = 9 / 16;
const MAX_HEIGHT_RATIO = 1;
const KEYBOARD_HEIGHT_STEP = 0.025;

interface ResizeDrag {
  readonly heightRatio: number;
  readonly maximumHeightRatio: number;
  readonly pointerId: number;
  readonly startY: number;
  readonly width: number;
}

type ResizableMediaSurface = HTMLElement & {
  setPresentationHeightRatio?(heightRatio: number): void;
};

/** Owns the bottom drawer's transient recorded-media height interaction. */
export class BottomDrawerMediaResizeController implements ReactiveController {
  private _drag?: ResizeDrag;
  private _frame?: number;
  private _handle?: HTMLButtonElement;
  private _heightRatio = DEFAULT_HEIGHT_RATIO;
  private _listening = false;
  private _scrollContainer?: HTMLElement;
  private _surface?: ResizableMediaSurface;
  private _footerBoundary?: HTMLElement;

  public constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  public get heightPercentage(): number {
    return Math.round(this._heightRatio * 100);
  }

  public observe(
    surface: HTMLElement | undefined,
    handle: HTMLButtonElement | undefined,
    footerBoundary: HTMLElement | undefined,
    scrollContainer: HTMLElement | undefined,
  ): void {
    this._surface = surface as ResizableMediaSurface | undefined;
    this._handle = handle;
    this._footerBoundary = footerBoundary;
    this._scrollContainer = scrollContainer;
    this._apply();
  }

  public reset(): void {
    this._finishDrag();
    this._heightRatio = DEFAULT_HEIGHT_RATIO;
    this._apply();
  }

  public hostDisconnected(): void {
    this._finishDrag();
    this._setSurfaceRatio(DEFAULT_HEIGHT_RATIO);
    this._surface = undefined;
    this._handle = undefined;
    this._footerBoundary = undefined;
    this._scrollContainer = undefined;
  }

  public readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const surface = this._surface;
    const handle = event.currentTarget as HTMLButtonElement;
    this._scrollContainer?.scrollTo({ top: 0 });
    const rect = surface?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    this._drag = {
      heightRatio: this._heightRatio,
      maximumHeightRatio: this._maximumHeightRatio(),
      pointerId: event.pointerId,
      startY: event.clientY,
      width: rect.width,
    };
    handle.setPointerCapture?.(event.pointerId);
    this._listenForCancellation();
    event.preventDefault();
  };

  public readonly handlePointerMove = (event: PointerEvent): void => {
    const drag = this._drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this._heightRatio = clampHeightRatioToMaximum(
      drag.heightRatio + (event.clientY - drag.startY) / drag.width,
      drag.maximumHeightRatio,
    );
    this._frame ??= requestAnimationFrame(this._commit);
    event.preventDefault();
  };

  public readonly handlePointerUp = (event: PointerEvent): void => {
    if (this._drag?.pointerId !== event.pointerId) return;
    this._releasePointer(event);
    this._finishDrag();
  };

  public readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this._drag?.pointerId !== event.pointerId) return;
    this._releasePointer(event);
    this._finishDrag();
  };

  public readonly handleLostPointerCapture = (event: PointerEvent): void => {
    if (this._drag?.pointerId !== event.pointerId) return;
    this._finishDrag();
  };

  public readonly handleDoubleClick = (event: MouseEvent): void => {
    event.preventDefault();
    this.reset();
  };

  public readonly handleKeyDown = (event: KeyboardEvent): void => {
    let nextRatio: number | undefined;
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      nextRatio = this._heightRatio + KEYBOARD_HEIGHT_STEP;
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      nextRatio = this._heightRatio - KEYBOARD_HEIGHT_STEP;
    } else if (event.key === "Home") {
      nextRatio = DEFAULT_HEIGHT_RATIO;
    } else if (event.key === "End") {
      nextRatio = this._maximumHeightRatio();
    } else {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    this._heightRatio = clampHeightRatioToMaximum(
      nextRatio,
      this._maximumHeightRatio(),
    );
    this._apply();
  };

  private readonly _commit = (): void => {
    this._frame = undefined;
    this._apply();
  };

  private _apply(): void {
    if (this._drag) this._scrollContainer?.scrollTo({ top: 0 });
    this._setSurfaceRatio(this._heightRatio);
    const percentage = this.heightPercentage;
    const maximumPercentage = Math.round(this._maximumHeightRatio() * 100);
    this._handle?.setAttribute("aria-valuemax", String(maximumPercentage));
    this._handle?.setAttribute("aria-valuenow", String(percentage));
    this._handle?.setAttribute("aria-valuetext", `${percentage}%`);
  }

  private _maximumHeightRatio(): number {
    const surfaceRect = this._surface?.getBoundingClientRect();
    const handleRect = this._handle?.getBoundingClientRect();
    const footerRect = this._footerBoundary?.getBoundingClientRect();
    if (!surfaceRect || !handleRect || !footerRect || surfaceRect.width <= 0) {
      return MAX_HEIGHT_RATIO;
    }
    const availableTravel = Math.max(0, footerRect.top - handleRect.bottom);
    return clampHeightRatio(
      this._heightRatio + availableTravel / surfaceRect.width,
    );
  }

  private _finishDrag(): void {
    this._flushFrame();
    const pointerId = this._drag?.pointerId;
    this._drag = undefined;
    if (
      pointerId !== undefined &&
      this._handle?.hasPointerCapture?.(pointerId)
    ) {
      this._handle.releasePointerCapture(pointerId);
    }
    this._removeCancellationListeners();
  }

  private _flushFrame(): void {
    if (this._frame === undefined) return;
    cancelAnimationFrame(this._frame);
    this._commit();
  }

  private _listenForCancellation(): void {
    if (this._listening) return;
    this._listening = true;
    window.addEventListener("pointermove", this.handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerCancel);
    window.addEventListener("blur", this._cancelFromEnvironment);
    window.addEventListener("pagehide", this._cancelFromEnvironment);
    document.addEventListener("freeze", this._cancelFromEnvironment);
    document.addEventListener("visibilitychange", this._cancelFromEnvironment);
  }

  private _removeCancellationListeners(): void {
    if (!this._listening) return;
    this._listening = false;
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerCancel);
    window.removeEventListener("blur", this._cancelFromEnvironment);
    window.removeEventListener("pagehide", this._cancelFromEnvironment);
    document.removeEventListener("freeze", this._cancelFromEnvironment);
    document.removeEventListener(
      "visibilitychange",
      this._cancelFromEnvironment,
    );
  }

  private readonly _cancelFromEnvironment = (event: Event): void => {
    if (
      event.type === "visibilitychange" &&
      document.visibilityState === "visible"
    ) {
      return;
    }
    this._finishDrag();
  };

  private _releasePointer(event: PointerEvent): void {
    const handle = this._handle;
    if (handle?.hasPointerCapture?.(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    if (event.pointerType === "touch") handle?.blur();
  }

  private _setSurfaceRatio(heightRatio: number): void {
    const surface = this._surface;
    if (!surface) return;
    if (typeof surface.setPresentationHeightRatio === "function") {
      surface.setPresentationHeightRatio(heightRatio);
      return;
    }
    if (surface instanceof HTMLImageElement) {
      const mediaHeightRatio =
        surface.naturalWidth > 0 && surface.naturalHeight > 0
          ? surface.naturalHeight / surface.naturalWidth
          : DEFAULT_HEIGHT_RATIO;
      surface.style.setProperty(
        "--wzc-recorded-media-object-fit",
        heightRatio > mediaHeightRatio ? "cover" : "contain",
      );
    }
    surface.style.setProperty(
      "--wzc-recorded-media-presentation-aspect-ratio",
      String(1 / heightRatio),
    );
  }
}

function clampHeightRatio(value: number): number {
  return Math.min(MAX_HEIGHT_RATIO, Math.max(DEFAULT_HEIGHT_RATIO, value));
}

function clampHeightRatioToMaximum(value: number, maximum: number): number {
  return Math.min(
    Math.max(DEFAULT_HEIGHT_RATIO, maximum),
    Math.max(DEFAULT_HEIGHT_RATIO, value),
  );
}
