import type { ReactiveController, ReactiveControllerHost } from "lit";

const CLICK_MOVE_TOLERANCE_PX = 6;
const DOUBLE_ACTIVATION_DELAY_MS = 350;
const DOUBLE_ACTIVATION_DISTANCE_PX = 24;
const DISCRETE_PIXEL_WHEEL_DELTA = 80;
const KEYBOARD_PAN_FRACTION = 0.05;
const MAX_ZOOM = 3;
const MIN_ZOOM = 1;
const TOGGLE_ZOOM = 2;
const WHEEL_DELTA_PIXEL = 0;
const WHEEL_ZOOM_STEP = 0.25;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface PointerPoint extends Point {
  readonly type: string;
}

interface DragStart extends Point {
  readonly panX: number;
  readonly panY: number;
  readonly pointerId: number;
}

interface PinchStart {
  readonly distance: number;
  readonly midpoint: Point;
  readonly panX: number;
  readonly panY: number;
  readonly scale: number;
}

interface TapCandidate extends Point {
  readonly pointerType: string;
  readonly time: number;
}

interface ZoomTransform {
  readonly panX: number;
  readonly panY: number;
  readonly scale: number;
}

/** Owns camera-media zoom, bounded pan, gestures, and lifecycle cleanup. */
export class CameraZoomController implements ReactiveController {
  private _basePresentationScale = 1;
  private _dragStart?: DragStart;
  private _gestureMoved = false;
  private _interacting = false;
  private _key?: string;
  private _mediaHeightRatio?: number;
  private _panX = 0;
  private _panY = 0;
  private _pinchStart?: PinchStart;
  private readonly _pointers = new Map<number, PointerPoint>();
  private _resizeObserver?: ResizeObserver;
  private _scale = MIN_ZOOM;
  private _stageResizeProgress = 0;
  private _stageResizeStart?: ZoomTransform;
  private _surface?: HTMLElement;
  private _surfaceHeight = 0;
  private _surfaceWidth = 0;
  private _tapCandidate?: TapCandidate;

  public constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  public get interacting(): boolean {
    return this._interacting;
  }

  public get stageResizeActive(): boolean {
    return this._stageResizeStart !== undefined;
  }

  public get scale(): number {
    return this._presentationTransform().scale;
  }

  public get transform(): string {
    const { panX, panY, scale } = this._presentationTransform();
    return `translate3d(${panX}px, ${panY}px, 0) scale(${scale * this._basePresentationScale})`;
  }

  public get zoomed(): boolean {
    return this.scale > MIN_ZOOM;
  }

  public get pannable(): boolean {
    return this.scale * this._basePresentationScale > MIN_ZOOM;
  }

  public setBasePresentationScale(scale: number): void {
    const nextScale = Number.isFinite(scale) ? Math.max(MIN_ZOOM, scale) : 1;
    if (Math.abs(nextScale - this._basePresentationScale) <= Number.EPSILON)
      return;
    this._basePresentationScale = nextScale;
    this._clampPan();
    this._host.requestUpdate();
  }

  public setMediaDimensions(width: number, height: number): void {
    const nextRatio =
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
        ? height / width
        : undefined;
    if (nextRatio === this._mediaHeightRatio) return;
    this._mediaHeightRatio = nextRatio;
    this._clampPan();
    this._host.requestUpdate();
  }

  public configure(key: string | undefined): void {
    if (this._key === key) return;
    this._key = key;
    this._mediaHeightRatio = undefined;
    this.reset();
  }

  public observe(surface: HTMLElement | undefined): void {
    if (this._surface === surface) return;
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this._surface = surface;
    this._surfaceWidth = surface?.clientWidth || 0;
    this._surfaceHeight = surface?.clientHeight || 0;
    if (surface && (!this._surfaceWidth || !this._surfaceHeight)) {
      const rect = surface.getBoundingClientRect();
      this._surfaceWidth ||= rect.width;
      this._surfaceHeight ||= rect.height;
    }
    if (!surface || typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) {
        this._surfaceWidth = entry.contentRect.width;
        this._surfaceHeight = entry.contentRect.height;
      }
      if (!this.stageResizeActive) this._clampPan();
      this._host.requestUpdate();
    });
    this._resizeObserver.observe(surface);
  }

  public hostDisconnected(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this._surface = undefined;
    this._surfaceWidth = 0;
    this._surfaceHeight = 0;
    this._releasePointers();
    this._dragStart = undefined;
    this._pinchStart = undefined;
    this._tapCandidate = undefined;
    this._stageResizeStart = undefined;
    this._stageResizeProgress = 0;
  }

  public reset(): void {
    this._scale = MIN_ZOOM;
    this._panX = 0;
    this._panY = 0;
    this._interacting = false;
    this._gestureMoved = false;
    this._releasePointers();
    this._dragStart = undefined;
    this._pinchStart = undefined;
    this._tapCandidate = undefined;
    this._stageResizeStart = undefined;
    this._stageResizeProgress = 0;
    this._host.requestUpdate();
  }

  public beginStageResizeReturn(): void {
    this._stageResizeStart = this._presentationTransform();
    this._stageResizeProgress = 0;
    this._host.requestUpdate();
  }

  public updateStageResizeReturn(progress: number): void {
    if (!this._stageResizeStart) this.beginStageResizeReturn();
    this._stageResizeProgress = Math.max(
      this._stageResizeProgress,
      Math.min(1, Math.max(0, progress)),
    );
    this._host.requestUpdate();
  }

  public endStageResizeReturn(): void {
    if (!this._stageResizeStart) return;
    const current = this._presentationTransform();
    this._scale = current.scale;
    this._panX = current.panX;
    this._panY = current.panY;
    this._stageResizeStart = undefined;
    this._stageResizeProgress = 0;
    this._clampPan();
    this._host.requestUpdate();
  }

  public readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const surface = event.currentTarget as HTMLElement;
    this._surface = surface;
    this._pointers.set(event.pointerId, {
      type: event.pointerType,
      x: event.clientX,
      y: event.clientY,
    });
    surface.setPointerCapture?.(event.pointerId);
    this._gestureMoved = false;

    if (this._touchPointers().length >= 2) {
      this._tapCandidate = undefined;
      this._startPinch();
      this._gestureMoved = true;
      this._interacting = true;
      event.preventDefault();
    } else {
      this._dragStart = {
        panX: this._panX,
        panY: this._panY,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      this._interacting = this.pannable;
      if (this.pannable) event.preventDefault();
    }
    this._host.requestUpdate();
  };

  public readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this._pointers.has(event.pointerId)) return;
    this._pointers.set(event.pointerId, {
      type: event.pointerType,
      x: event.clientX,
      y: event.clientY,
    });
    const touches = this._touchPointers();
    if (touches.length >= 2) {
      this._pinchStart ??= this._createPinchStart(touches);
      const [first, second] = touches;
      const midpoint = this._localPoint(this._midpoint(first, second));
      const distance = this._distance(first, second);
      const start = this._pinchStart;
      const nextScale = this._clampScale(
        start.scale * (distance / Math.max(start.distance, 1)),
      );
      const ratio = nextScale / start.scale;
      this._scale = nextScale;
      this._panX = midpoint.x - start.midpoint.x * ratio + start.panX * ratio;
      this._panY = midpoint.y - start.midpoint.y * ratio + start.panY * ratio;
      this._gestureMoved = true;
      this._interacting = true;
      this._clampPan();
      event.preventDefault();
      this._host.requestUpdate();
      return;
    }

    const drag = this._dragStart;
    if (!drag || drag.pointerId !== event.pointerId || !this.pannable) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (
      Math.hypot(deltaX, deltaY) >= CLICK_MOVE_TOLERANCE_PX ||
      this._gestureMoved
    ) {
      this._gestureMoved = true;
      this._panX = drag.panX + deltaX;
      this._panY = drag.panY + deltaY;
      this._clampPan();
      event.preventDefault();
      this._host.requestUpdate();
    }
  };

  public readonly handlePointerUp = (event: PointerEvent): void => {
    this._finishPointer(event, true);
  };

  public readonly handlePointerCancel = (event: PointerEvent): void => {
    this._finishPointer(event, false);
  };

  public readonly handleWheel = (event: WheelEvent): void => {
    if (event.ctrlKey || event.metaKey) return;
    const discreteWheel =
      event.deltaMode !== WHEEL_DELTA_PIXEL ||
      (Math.abs(event.deltaY) >= DISCRETE_PIXEL_WHEEL_DELTA &&
        Math.abs(event.deltaX) < Math.abs(event.deltaY) / 2);
    if (!discreteWheel) return;

    this._tapCandidate = undefined;
    const nextScale = this._clampScale(
      this._scale + (event.deltaY < 0 ? WHEEL_ZOOM_STEP : -WHEEL_ZOOM_STEP),
    );
    if (nextScale === this._scale) return;
    event.preventDefault();
    this._setScaleAt(nextScale, event.clientX, event.clientY);
    this._host.requestUpdate();
  };

  public readonly handleKeyDown = (event: KeyboardEvent): void => {
    const rect = this._surface?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : 0;
    const centerY = rect ? rect.top + rect.height / 2 : 0;
    if (event.key === "Enter" || event.key === " ") {
      this._tapCandidate = undefined;
      event.preventDefault();
      this._toggleAt(centerX, centerY);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      this._tapCandidate = undefined;
      event.preventDefault();
      this._setScaleAt(this._scale + WHEEL_ZOOM_STEP, centerX, centerY);
    } else if (event.key === "-") {
      this._tapCandidate = undefined;
      event.preventDefault();
      this._setScaleAt(this._scale - WHEEL_ZOOM_STEP, centerX, centerY);
    } else if (event.key === "0" || event.key === "Escape") {
      if (!this.pannable) return;
      event.preventDefault();
      this.reset();
      return;
    } else if (this.pannable && event.key.startsWith("Arrow")) {
      const amount = Math.max(
        1,
        Math.min(rect?.width ?? 0, rect?.height ?? 0) * KEYBOARD_PAN_FRACTION,
      );
      if (event.key === "ArrowLeft") this._panX += amount;
      else if (event.key === "ArrowRight") this._panX -= amount;
      else if (event.key === "ArrowUp") this._panY += amount;
      else if (event.key === "ArrowDown") this._panY -= amount;
      event.preventDefault();
      this._clampPan();
    } else {
      return;
    }
    this._host.requestUpdate();
  };

  private _finishPointer(event: PointerEvent, activate: boolean): void {
    const wasPinching = Boolean(this._pinchStart);
    const drag = this._dragStart;
    const eligible =
      activate &&
      !wasPinching &&
      !this._gestureMoved &&
      drag?.pointerId === event.pointerId;
    this._pointers.delete(event.pointerId);
    const surface = event.currentTarget as HTMLElement;
    if (surface.hasPointerCapture?.(event.pointerId)) {
      surface.releasePointerCapture(event.pointerId);
    }
    if (this._touchPointers().length < 2) this._pinchStart = undefined;
    this._dragStart = undefined;
    this._interacting = false;
    if (eligible) this._activateTap(event);
    else {
      this._tapCandidate = undefined;
      this._host.requestUpdate();
    }
  }

  private _activateTap(event: PointerEvent): void {
    const now = performance.now();
    const previous = this._tapCandidate;
    const isDoubleActivation = Boolean(
      previous &&
      previous.pointerType === event.pointerType &&
      now - previous.time <= DOUBLE_ACTIVATION_DELAY_MS &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <=
        DOUBLE_ACTIVATION_DISTANCE_PX,
    );
    if (isDoubleActivation) {
      this._tapCandidate = undefined;
      this._toggleAt(event.clientX, event.clientY);
      return;
    }
    this._tapCandidate = {
      pointerType: event.pointerType,
      time: now,
      x: event.clientX,
      y: event.clientY,
    };
    this._host.requestUpdate();
  }

  private _toggleAt(clientX: number, clientY: number): void {
    if (this.zoomed) {
      this.reset();
      return;
    }
    this._setScaleAt(TOGGLE_ZOOM, clientX, clientY);
    this._host.requestUpdate();
  }

  private _setScaleAt(scale: number, clientX: number, clientY: number): void {
    const nextScale = this._clampScale(scale);
    if (nextScale === MIN_ZOOM) {
      this.reset();
      return;
    }
    const rect = this._surface?.getBoundingClientRect();
    const focalX = rect ? clientX - (rect.left + rect.width / 2) : 0;
    const focalY = rect ? clientY - (rect.top + rect.height / 2) : 0;
    const ratio = nextScale / this._scale;
    this._panX = focalX - ratio * (focalX - this._panX);
    this._panY = focalY - ratio * (focalY - this._panY);
    this._scale = nextScale;
    this._clampPan();
  }

  private _startPinch(): void {
    this._pinchStart = this._createPinchStart(this._touchPointers());
  }

  private _createPinchStart(points: readonly PointerPoint[]): PinchStart {
    const [first, second] = points;
    return {
      distance: this._distance(first, second),
      midpoint: this._localPoint(this._midpoint(first, second)),
      panX: this._panX,
      panY: this._panY,
      scale: this._scale,
    };
  }

  private _touchPointers(): PointerPoint[] {
    return [...this._pointers.values()].filter(
      ({ type }) => type === "touch" || type === "pen",
    );
  }

  private _distance(first: Point, second: Point): number {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  private _midpoint(first: Point, second: Point): Point {
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  }

  private _localPoint(point: Point): Point {
    const rect = this._surface?.getBoundingClientRect();
    return rect
      ? {
          x: point.x - (rect.left + rect.width / 2),
          y: point.y - (rect.top + rect.height / 2),
        }
      : point;
  }

  private _clampScale(scale: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
  }

  private _clampPan(): void {
    if (!this.pannable) {
      this._panX = 0;
      this._panY = 0;
      return;
    }
    const pan = this._clampTransformPan(this._panX, this._panY, this._scale);
    this._panX = pan.x;
    this._panY = pan.y;
  }

  private _presentationTransform(): ZoomTransform {
    const start = this._stageResizeStart;
    if (!start) {
      return { panX: this._panX, panY: this._panY, scale: this._scale };
    }
    const progress = this._stageResizeProgress;
    const scale = start.scale + (MIN_ZOOM - start.scale) * progress;
    const pan = this._clampTransformPan(
      start.panX * (1 - progress),
      start.panY * (1 - progress),
      scale,
    );
    return { panX: pan.x, panY: pan.y, scale };
  }

  private _clampTransformPan(
    panX: number,
    panY: number,
    userScale: number,
  ): Point {
    const scale = userScale * this._basePresentationScale;
    if (scale <= MIN_ZOOM) return { x: 0, y: 0 };
    const width = this._surfaceWidth;
    const height = this._surfaceHeight;
    if (!width || !height) return { x: panX, y: panY };
    const stageHeightRatio = height / width;
    const contentWidth =
      this._mediaHeightRatio !== undefined &&
      stageHeightRatio < this._mediaHeightRatio
        ? height / this._mediaHeightRatio
        : width;
    const contentHeight =
      this._mediaHeightRatio !== undefined &&
      stageHeightRatio > this._mediaHeightRatio
        ? width * this._mediaHeightRatio
        : height;
    const maxX = Math.max(0, (contentWidth * scale - width) / 2);
    const maxY = Math.max(0, (contentHeight * scale - height) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, panX)),
      y: Math.min(maxY, Math.max(-maxY, panY)),
    };
  }

  private _releasePointers(): void {
    if (this._surface) {
      for (const pointerId of this._pointers.keys()) {
        if (this._surface.hasPointerCapture?.(pointerId)) {
          this._surface.releasePointerCapture(pointerId);
        }
      }
    }
    this._pointers.clear();
  }
}
