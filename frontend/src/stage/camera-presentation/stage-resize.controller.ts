import type { ReactiveController, ReactiveControllerHost } from "lit";

import { CAMERA_STAGE_SIZE_CHANGE_EVENT } from "../../core/constants";

export const DEFAULT_CAMERA_STAGE_HEIGHT_RATIO = 9 / 16;
const DOUBLE_ACTIVATION_DELAY_MS = 350;
const DOUBLE_ACTIVATION_DISTANCE_PX = 24;
const DRAG_MOVE_TOLERANCE_PX = 3;
const FIT_RATIO_TOLERANCE = 0.005;
const KEYBOARD_HEIGHT_STEP = 0.025;
const MAX_HEIGHT_RATIO = 1;
const STAGE_CONSTRAINT_TOLERANCE = 0.01;

interface DragStart {
  readonly heightRatio: number;
  readonly pointerId: number;
  readonly stageWidth: number;
  readonly x: number;
  readonly y: number;
}

interface TapCandidate {
  readonly pointerType: string;
  readonly time: number;
  readonly x: number;
  readonly y: number;
}

export type CameraStageResizeInteraction =
  | { readonly phase: "start" }
  | { readonly phase: "update"; readonly returnProgress: number }
  | { readonly phase: "end" };

export interface CameraStageSize {
  readonly heightRatio: number;
  readonly resized: boolean;
}

export interface CameraStageSizeChangeDetail extends CameraStageSize {
  readonly transient?: boolean;
}

type CameraStageSizeEventHost = HTMLElement & ReactiveControllerHost;

/** Coalesces transient stage-size intents while preserving one final update. */
export class CameraStageSizeEventController implements ReactiveController {
  private _active = false;
  private _frame?: number;
  private _interactionUpdated = false;
  private _lastDetail?: CameraStageSizeChangeDetail;
  private _pending?: CameraStageSize;

  public constructor(private readonly _host: CameraStageSizeEventHost) {
    _host.addController(this);
  }

  public begin(): void {
    this._active = true;
    this._interactionUpdated = false;
  }

  public update(size: CameraStageSize): void {
    if (!this._active) {
      this._cancelPending();
      this._dispatch(size, false);
      return;
    }
    this._interactionUpdated = true;
    this._pending = size;
    this._frame ??= requestAnimationFrame(this._flush);
  }

  public end(size: CameraStageSize): void {
    const interactionUpdated = this._interactionUpdated;
    this._active = false;
    this._interactionUpdated = false;
    this._cancelPending();
    if (interactionUpdated) this._dispatch(size, false);
  }

  public hostDisconnected(): void {
    this._active = false;
    this._interactionUpdated = false;
    this._cancelPending();
    this._lastDetail = undefined;
  }

  private readonly _flush = (): void => {
    this._frame = undefined;
    const size = this._pending;
    this._pending = undefined;
    if (size) this._dispatch(size, true);
  };

  private _cancelPending(): void {
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = undefined;
    this._pending = undefined;
  }

  private _dispatch(size: CameraStageSize, transient: boolean): void {
    const detail = { ...size, transient };
    if (
      detail.heightRatio === this._lastDetail?.heightRatio &&
      detail.resized === this._lastDetail.resized &&
      detail.transient === this._lastDetail.transient
    ) {
      return;
    }
    this._lastDetail = detail;
    this._host.dispatchEvent(
      new CustomEvent(CAMERA_STAGE_SIZE_CHANGE_EVENT, {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
  }
}

/** Owns transient camera-stage height without owning media zoom or pan. */
export class CameraStageResizeController implements ReactiveController {
  private _active = true;
  private _dragStart?: DragStart;
  private _dragUpdateFrame?: number;
  private _handle?: HTMLButtonElement;
  private _heightRatio = DEFAULT_CAMERA_STAGE_HEIGHT_RATIO;
  private _interactionLifecycleListening = false;
  private _key?: string;
  private _mediaHeightRatio?: number;
  private _mediaPresentationScale = 1;
  private _moved = false;
  private _resized = false;
  private _returnAnchorHeightRatio = DEFAULT_CAMERA_STAGE_HEIGHT_RATIO;
  private _stage?: HTMLElement;
  private _tapCandidate?: TapCandidate;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _onInteraction?: (
      interaction: CameraStageResizeInteraction,
    ) => void,
    private readonly _onMediaPresentationScaleChange?: (scale: number) => void,
    private readonly _onSizeChange?: (size: CameraStageSize) => void,
  ) {
    _host.addController(this);
  }

  public get heightPercentage(): number {
    return Math.round(this._heightRatio * 100);
  }

  public get mediaPresentationScale(): number {
    return this._mediaPresentationScale;
  }

  public get size(): CameraStageSize {
    return { heightRatio: this._heightRatio, resized: this._resized };
  }

  public configure(key: string | undefined): void {
    if (this._key === key) return;
    this._key = key;
    this._mediaHeightRatio = undefined;
    this._syncMediaPresentationScale();
  }

  public setSize(size: CameraStageSize): void {
    if (this._dragStart) return;
    const heightRatio = this._clampHeightRatio(size.heightRatio);
    const resized =
      size.resized && heightRatio > DEFAULT_CAMERA_STAGE_HEIGHT_RATIO;
    if (heightRatio === this._heightRatio && resized === this._resized) return;
    this._heightRatio = heightRatio;
    this._resized = resized;
    this._applyPresentation();
  }

  /** Cancels transient ownership when another camera presentation activates. */
  public setActive(active: boolean): void {
    if (this._active === active) return;
    this._active = active;
    if (!active) {
      this._finishDrag();
      this._tapCandidate = undefined;
    }
  }

  public observe(
    stage: HTMLElement | undefined,
    handle: HTMLButtonElement | undefined,
  ): void {
    if (this._stage !== stage) {
      this._clearStage(this._stage);
      this._stage = stage;
    }
    this._handle = handle;
    this._applyPresentation();
  }

  public setMediaDimensions(width: number, height: number): void {
    const ratio =
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
        ? height / width
        : undefined;
    if (ratio === this._mediaHeightRatio) return;
    this._mediaHeightRatio = ratio;
    this._syncMediaPresentationScale();
  }

  public reset(): void {
    this._cancelDragUpdate();
    this._heightRatio = DEFAULT_CAMERA_STAGE_HEIGHT_RATIO;
    this._resized = false;
    this._finishDrag();
    this._tapCandidate = undefined;
    this._applyPresentation();
    this._notifySizeChange();
    this._host.requestUpdate();
  }

  public hostDisconnected(): void {
    this._cancelDragUpdate();
    this._finishDrag();
    this._clearStage(this._stage);
    this._stage = undefined;
    this._handle = undefined;
    this._tapCandidate = undefined;
  }

  public readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this._active) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const stage = this._stage;
    const handle = event.currentTarget as HTMLButtonElement;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0) return;
    if (this._isExternallyConstrained(rect)) return;
    this._heightRatio = this._clampHeightRatio(rect.height / rect.width);
    this._dragStart = {
      heightRatio: this._heightRatio,
      pointerId: event.pointerId,
      stageWidth: rect.width,
      x: event.clientX,
      y: event.clientY,
    };
    this._returnAnchorHeightRatio = this._heightRatio;
    this._onInteraction?.({ phase: "start" });
    this._moved = false;
    handle.setPointerCapture?.(event.pointerId);
    this._listenForInteractionCancellation();
    stage.classList.add("stage-resizing");
    event.preventDefault();
  };

  public readonly handlePointerMove = (event: PointerEvent): void => {
    const drag = this._dragStart;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaY = event.clientY - drag.y;
    if (
      !this._moved &&
      Math.hypot(event.clientX - drag.x, deltaY) >= DRAG_MOVE_TOLERANCE_PX
    ) {
      this._moved = true;
      this._tapCandidate = undefined;
    }
    if (!this._moved) return;
    this._heightRatio = this._clampHeightRatio(
      drag.heightRatio + deltaY / drag.stageWidth,
    );
    this._returnAnchorHeightRatio = Math.max(
      this._returnAnchorHeightRatio,
      this._heightRatio,
    );
    this._resized = true;
    this._scheduleDragUpdate();
    event.preventDefault();
  };

  public readonly handlePointerUp = (event: PointerEvent): void => {
    const eligible =
      this._dragStart?.pointerId === event.pointerId && !this._moved;
    this._releasePointer(event);
    this._finishDrag();
    if (eligible) this._activateTap(event);
    else this._tapCandidate = undefined;
  };

  public readonly handlePointerCancel = (event: PointerEvent): void => {
    this._releasePointer(event);
    this._finishDrag();
    this._tapCandidate = undefined;
  };

  public readonly handleLostPointerCapture = (): void => {
    this._finishDrag();
    this._tapCandidate = undefined;
  };

  public readonly handleKeyDown = (event: KeyboardEvent): void => {
    const stageRect = this._stage?.getBoundingClientRect();
    if (stageRect && this._isExternallyConstrained(stageRect)) return;
    let nextRatio: number | undefined;
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      nextRatio = this._heightRatio + KEYBOARD_HEIGHT_STEP;
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      nextRatio = this._heightRatio - KEYBOARD_HEIGHT_STEP;
    } else if (event.key === "Home") {
      event.stopPropagation();
      this.reset();
      event.preventDefault();
      return;
    } else if (event.key === "End") {
      nextRatio = MAX_HEIGHT_RATIO;
    } else {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    this._heightRatio = this._clampHeightRatio(nextRatio);
    this._resized = this._heightRatio !== DEFAULT_CAMERA_STAGE_HEIGHT_RATIO;
    this._applyPresentation();
    this._notifySizeChange();
  };

  private _activateTap(event: PointerEvent): void {
    const now = performance.now();
    const previous = this._tapCandidate;
    const doubleActivation = Boolean(
      previous &&
      previous.pointerType === event.pointerType &&
      now - previous.time <= DOUBLE_ACTIVATION_DELAY_MS &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <=
        DOUBLE_ACTIVATION_DISTANCE_PX,
    );
    if (doubleActivation) {
      this._tapCandidate = undefined;
      this.reset();
      return;
    }
    this._tapCandidate = {
      pointerType: event.pointerType,
      time: now,
      x: event.clientX,
      y: event.clientY,
    };
  }

  private _applyPresentation(): void {
    if (!this._stage) return;
    this._stage.classList.toggle("stage-resized", this._resized);
    if (this._resized) {
      this._stage.style.setProperty(
        "--wzc-camera-stage-runtime-aspect-ratio",
        String(1 / this._heightRatio),
      );
    } else {
      this._stage.style.removeProperty(
        "--wzc-camera-stage-runtime-aspect-ratio",
      );
    }
    this._syncMediaPresentationScale();
    this._syncHandle();
  }

  private _syncMediaPresentationScale(): void {
    const nextScale =
      this._resized &&
      this._mediaHeightRatio !== undefined &&
      this._heightRatio > this._mediaHeightRatio + FIT_RATIO_TOLERANCE
        ? this._heightRatio / this._mediaHeightRatio
        : 1;
    if (Math.abs(nextScale - this._mediaPresentationScale) <= Number.EPSILON)
      return;
    this._mediaPresentationScale = nextScale;
    this._onMediaPresentationScaleChange?.(nextScale);
  }

  private _syncHandle(): void {
    const handle = this._handle;
    if (!handle) return;
    const percentage = this.heightPercentage;
    handle.setAttribute("aria-valuenow", String(percentage));
    handle.setAttribute("aria-valuetext", `${percentage}% of stage width`);
  }

  private _finishDrag(): void {
    const interactionActive = this._dragStart !== undefined;
    const pointerId = this._dragStart?.pointerId;
    this._flushDragUpdate();
    this._removeInteractionLifecycleListeners();
    this._dragStart = undefined;
    this._returnAnchorHeightRatio = DEFAULT_CAMERA_STAGE_HEIGHT_RATIO;
    this._moved = false;
    if (
      pointerId !== undefined &&
      this._handle?.hasPointerCapture?.(pointerId)
    ) {
      this._handle.releasePointerCapture(pointerId);
    }
    this._stage?.classList.remove("stage-resizing");
    if (interactionActive) this._onInteraction?.({ phase: "end" });
  }

  private _scheduleDragUpdate(): void {
    this._dragUpdateFrame ??= requestAnimationFrame(this._commitDragUpdate);
  }

  private readonly _commitDragUpdate = (): void => {
    this._dragUpdateFrame = undefined;
    this._applyPresentation();
    this._notifySizeChange();
    this._onInteraction?.({
      phase: "update",
      returnProgress: this._returnProgress(),
    });
  };

  private _flushDragUpdate(): void {
    if (this._dragUpdateFrame === undefined) return;
    cancelAnimationFrame(this._dragUpdateFrame);
    this._commitDragUpdate();
  }

  private _cancelDragUpdate(): void {
    if (this._dragUpdateFrame === undefined) return;
    cancelAnimationFrame(this._dragUpdateFrame);
    this._dragUpdateFrame = undefined;
  }

  private _listenForInteractionCancellation(): void {
    if (this._interactionLifecycleListening) return;
    this._interactionLifecycleListening = true;
    window.addEventListener("blur", this._cancelFromEnvironment);
    window.addEventListener("pagehide", this._cancelFromEnvironment);
    document.addEventListener("freeze", this._cancelFromEnvironment);
    document.addEventListener("visibilitychange", this._cancelFromEnvironment);
  }

  private _removeInteractionLifecycleListeners(): void {
    if (!this._interactionLifecycleListening) return;
    this._interactionLifecycleListening = false;
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
    this._tapCandidate = undefined;
  };

  private _releasePointer(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLButtonElement;
    if (handle.hasPointerCapture?.(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    if (event.pointerType === "touch") handle.blur();
  }

  private _clearStage(stage: HTMLElement | undefined): void {
    stage?.classList.remove("stage-resizing");
    stage?.classList.remove("stage-resized");
    stage?.style.removeProperty("--wzc-camera-stage-runtime-aspect-ratio");
  }

  private _clampHeightRatio(ratio: number): number {
    return Math.min(
      MAX_HEIGHT_RATIO,
      Math.max(DEFAULT_CAMERA_STAGE_HEIGHT_RATIO, ratio),
    );
  }

  private _returnProgress(): number {
    const returnRange =
      this._returnAnchorHeightRatio - DEFAULT_CAMERA_STAGE_HEIGHT_RATIO;
    if (returnRange <= 0) return 0;
    return Math.min(
      1,
      Math.max(
        0,
        (this._returnAnchorHeightRatio - this._heightRatio) / returnRange,
      ),
    );
  }

  private _notifySizeChange(): void {
    this._onSizeChange?.(this.size);
  }

  private _isExternallyConstrained(rect: DOMRect): boolean {
    if (this._resized || rect.width <= 0) return false;
    return (
      Math.abs(rect.height / rect.width - DEFAULT_CAMERA_STAGE_HEIGHT_RATIO) >
      STAGE_CONSTRAINT_TOLERANCE
    );
  }
}
