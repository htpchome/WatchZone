import type { ReactiveController, ReactiveControllerHost } from "lit";

export const DEFAULT_MEDIA_STAGE_HEIGHT_RATIO = 9 / 16;

const DOUBLE_ACTIVATION_DELAY_MS = 350;
const DOUBLE_ACTIVATION_DISTANCE_PX = 24;
const DRAG_MOVE_TOLERANCE_PX = 3;
const FIT_RATIO_TOLERANCE = 0.005;
const KEYBOARD_HEIGHT_STEP = 0.025;
const DEFAULT_MAXIMUM_HEIGHT_RATIO = 1;

interface DragStart {
  readonly heightRatio: number;
  readonly maximumHeightRatio: number;
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

export type MediaStageResizeInteraction =
  | { readonly phase: "start" }
  | { readonly phase: "update"; readonly returnProgress: number }
  | { readonly phase: "end" };

export interface MediaStageSize {
  readonly heightRatio: number;
  readonly resized: boolean;
}

export interface MediaStageResizeContext {
  readonly currentHeightRatio: number;
  readonly handle?: HTMLButtonElement;
  readonly stage?: HTMLElement;
}

export interface MediaStageResizeOptions {
  readonly defaultHeightRatio?: number;
  readonly maximumHeightRatio?: (context: MediaStageResizeContext) => number;
  readonly onInteraction?: (interaction: MediaStageResizeInteraction) => void;
  readonly onMediaPresentationScaleChange?: (scale: number) => void;
  readonly onSizeChange?: (size: MediaStageSize) => void;
  readonly presentationAspectRatioProperty: string;
  readonly resizedClass?: string;
  readonly stageIsConstrained?: (
    rect: DOMRect,
    size: MediaStageSize,
  ) => boolean;
}

/**
 * Owns one resizable media stage's height gesture and base fit scale.
 *
 * It never transforms media. The consumer forwards the emitted base scale and
 * return progress to the shared zoom controller, which remains the sole owner
 * of media transforms and pan bounds.
 */
export class MediaStageResizeController implements ReactiveController {
  private _active = true;
  private _dragStart?: DragStart;
  private _dragUpdateFrame?: number;
  private _handle?: HTMLButtonElement;
  private _heightRatio: number;
  private _interactionLifecycleListening = false;
  private _key?: string;
  private _mediaHeightRatio?: number;
  private _mediaPresentationScale = 1;
  private _moved = false;
  private _resized = false;
  private _returnAnchorHeightRatio: number;
  private _stage?: HTMLElement;
  private _tapCandidate?: TapCandidate;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _options: MediaStageResizeOptions,
  ) {
    _host.addController(this);
    this._heightRatio = this._defaultHeightRatio;
    this._returnAnchorHeightRatio = this._defaultHeightRatio;
  }

  private get _defaultHeightRatio(): number {
    return this._options.defaultHeightRatio ?? DEFAULT_MEDIA_STAGE_HEIGHT_RATIO;
  }

  public get heightPercentage(): number {
    return Math.round(this._heightRatio * 100);
  }

  public get mediaPresentationScale(): number {
    return this._mediaPresentationScale;
  }

  public get size(): MediaStageSize {
    return { heightRatio: this._heightRatio, resized: this._resized };
  }

  public configure(key: string | undefined): void {
    if (this._key === key) return;
    this._key = key;
    this._mediaHeightRatio = undefined;
    this._syncMediaPresentationScale();
  }

  public setSize(size: MediaStageSize): void {
    if (this._dragStart) return;
    const heightRatio = this._clampHeightRatio(size.heightRatio);
    const resized = size.resized && heightRatio > this._defaultHeightRatio;
    if (heightRatio === this._heightRatio && resized === this._resized) return;
    this._heightRatio = heightRatio;
    this._resized = resized;
    this._applyPresentation();
  }

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
    this._heightRatio = this._defaultHeightRatio;
    this._resized = false;
    this._finishDrag();
    this._tapCandidate = undefined;
    this._applyPresentation();
    this._options.onSizeChange?.(this.size);
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
    this._handle = handle;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || this._isExternallyConstrained(rect)) return;
    this._heightRatio = this._clampHeightRatio(rect.height / rect.width);
    this._dragStart = {
      heightRatio: this._heightRatio,
      maximumHeightRatio: this._maximumHeightRatio(),
      pointerId: event.pointerId,
      stageWidth: rect.width,
      x: event.clientX,
      y: event.clientY,
    };
    this._returnAnchorHeightRatio = this._heightRatio;
    this._options.onInteraction?.({ phase: "start" });
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
      drag.maximumHeightRatio,
    );
    this._returnAnchorHeightRatio = Math.max(
      this._returnAnchorHeightRatio,
      this._heightRatio,
    );
    // Preserve the explicit runtime ratio for the complete direct gesture,
    // including the frame that reaches the default stop. The owning parent
    // commits the final semantic size after the gesture ends.
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

  public readonly handleDoubleClick = (event: MouseEvent): void => {
    event.preventDefault();
    this.reset();
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
      nextRatio = this._maximumHeightRatio();
    } else {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    this._heightRatio = this._clampHeightRatio(
      nextRatio,
      this._maximumHeightRatio(),
    );
    this._resized = this._heightRatio > this._defaultHeightRatio;
    this._applyPresentation();
    this._options.onSizeChange?.(this.size);
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
    if (this._options.resizedClass) {
      this._stage.classList.toggle(this._options.resizedClass, this._resized);
    }
    if (this._resized) {
      this._stage.style.setProperty(
        this._options.presentationAspectRatioProperty,
        String(1 / this._heightRatio),
      );
    } else {
      this._stage.style.removeProperty(
        this._options.presentationAspectRatioProperty,
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
    this._options.onMediaPresentationScaleChange?.(nextScale);
  }

  private _syncHandle(): void {
    const handle = this._handle;
    if (!handle) return;
    const percentage = this.heightPercentage;
    handle.setAttribute(
      "aria-valuemin",
      String(Math.round(this._defaultHeightRatio * 100)),
    );
    handle.setAttribute(
      "aria-valuemax",
      String(Math.round(this._maximumHeightRatio() * 100)),
    );
    handle.setAttribute("aria-valuenow", String(percentage));
    handle.setAttribute("aria-valuetext", `${percentage}% of stage width`);
  }

  private _finishDrag(): void {
    const interactionActive = this._dragStart !== undefined;
    const pointerId = this._dragStart?.pointerId;
    this._flushDragUpdate();
    this._removeInteractionLifecycleListeners();
    this._dragStart = undefined;
    this._returnAnchorHeightRatio = this._defaultHeightRatio;
    this._moved = false;
    if (
      pointerId !== undefined &&
      this._handle?.hasPointerCapture?.(pointerId)
    ) {
      this._handle.releasePointerCapture(pointerId);
    }
    this._stage?.classList.remove("stage-resizing");
    if (interactionActive) this._options.onInteraction?.({ phase: "end" });
  }

  private _scheduleDragUpdate(): void {
    this._dragUpdateFrame ??= requestAnimationFrame(this._commitDragUpdate);
  }

  private readonly _commitDragUpdate = (): void => {
    this._dragUpdateFrame = undefined;
    this._applyPresentation();
    this._options.onSizeChange?.(this.size);
    this._options.onInteraction?.({
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
    if (this._options.resizedClass) {
      stage?.classList.remove(this._options.resizedClass);
    }
    stage?.style.removeProperty(this._options.presentationAspectRatioProperty);
  }

  private _clampHeightRatio(
    ratio: number,
    maximum = this._maximumHeightRatio(),
  ): number {
    return Math.min(maximum, Math.max(this._defaultHeightRatio, ratio));
  }

  private _maximumHeightRatio(): number {
    const maximum =
      this._options.maximumHeightRatio?.({
        currentHeightRatio: this._heightRatio,
        handle: this._handle,
        stage: this._stage,
      }) ?? DEFAULT_MAXIMUM_HEIGHT_RATIO;
    return Math.max(
      this._defaultHeightRatio,
      Number.isFinite(maximum) ? maximum : DEFAULT_MAXIMUM_HEIGHT_RATIO,
    );
  }

  private _returnProgress(): number {
    const returnRange =
      this._returnAnchorHeightRatio - this._defaultHeightRatio;
    if (returnRange <= 0) return 0;
    return Math.min(
      1,
      Math.max(
        0,
        (this._returnAnchorHeightRatio - this._heightRatio) / returnRange,
      ),
    );
  }

  private _isExternallyConstrained(rect: DOMRect): boolean {
    return this._options.stageIsConstrained?.(rect, this.size) ?? false;
  }
}
