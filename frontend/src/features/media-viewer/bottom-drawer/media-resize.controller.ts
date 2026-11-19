import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { RecordedVideoPlayer } from "../recorded-video-player";

const DEFAULT_HEIGHT_RATIO = 9 / 16;
const MAX_HEIGHT_RATIO = 1;
const KEYBOARD_HEIGHT_STEP = 0.025;

interface ResizeDrag {
  readonly heightRatio: number;
  readonly pointerId: number;
  readonly startY: number;
  readonly width: number;
}

/** Owns the bottom drawer's transient recorded-video height interaction. */
export class BottomDrawerMediaResizeController implements ReactiveController {
  private _drag?: ResizeDrag;
  private _frame?: number;
  private _handle?: HTMLButtonElement;
  private _heightRatio = DEFAULT_HEIGHT_RATIO;
  private _listening = false;
  private _player?: RecordedVideoPlayer;

  public constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  public get heightPercentage(): number {
    return Math.round(this._heightRatio * 100);
  }

  public observe(
    player: RecordedVideoPlayer | undefined,
    handle: HTMLButtonElement | undefined,
  ): void {
    this._player = player;
    this._handle = handle;
    this._apply();
  }

  public reset(): void {
    this._finishDrag();
    this._heightRatio = DEFAULT_HEIGHT_RATIO;
    this._apply();
  }

  public hostDisconnected(): void {
    this._finishDrag();
    this._player?.setPresentationHeightRatio(DEFAULT_HEIGHT_RATIO);
    this._player = undefined;
    this._handle = undefined;
  }

  public readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const player = this._player;
    const handle = event.currentTarget as HTMLButtonElement;
    const rect = player?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    this._drag = {
      heightRatio: this._heightRatio,
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
    this._heightRatio = clampHeightRatio(
      drag.heightRatio + (event.clientY - drag.startY) / drag.width,
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
      nextRatio = MAX_HEIGHT_RATIO;
    } else {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    this._heightRatio = clampHeightRatio(nextRatio);
    this._apply();
  };

  private readonly _commit = (): void => {
    this._frame = undefined;
    this._apply();
  };

  private _apply(): void {
    this._player?.setPresentationHeightRatio(this._heightRatio);
    const percentage = this.heightPercentage;
    this._handle?.setAttribute("aria-valuenow", String(percentage));
    this._handle?.setAttribute("aria-valuetext", `${percentage}%`);
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
}

function clampHeightRatio(value: number): number {
  return Math.min(MAX_HEIGHT_RATIO, Math.max(DEFAULT_HEIGHT_RATIO, value));
}
