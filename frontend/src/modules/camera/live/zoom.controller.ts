import type { ReactiveController, ReactiveControllerHost } from "lit";

const CLICK_MOVE_TOLERANCE_PX = 6;
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

/** Owns camera-media zoom, bounded pan, gestures, and lifecycle cleanup. */
export class CameraZoomController implements ReactiveController {
  private _dragStart?: DragStart;
  private _gestureMoved = false;
  private _interacting = false;
  private _key?: string;
  private _panX = 0;
  private _panY = 0;
  private _pinchStart?: PinchStart;
  private readonly _pointers = new Map<number, PointerPoint>();
  private _resizeObserver?: ResizeObserver;
  private _scale = MIN_ZOOM;
  private _surface?: HTMLElement;

  public constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  public get interacting(): boolean {
    return this._interacting;
  }

  public get scale(): number {
    return this._scale;
  }

  public get transform(): string {
    return `translate3d(${this._panX}px, ${this._panY}px, 0) scale(${this._scale})`;
  }

  public get zoomed(): boolean {
    return this._scale > MIN_ZOOM;
  }

  public configure(key: string | undefined): void {
    if (this._key === key) return;
    this._key = key;
    this.reset();
  }

  public observe(surface: HTMLElement | undefined): void {
    if (this._surface === surface) return;
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this._surface = surface;
    if (!surface || typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(() => {
      this._clampPan();
      this._host.requestUpdate();
    });
    this._resizeObserver.observe(surface);
  }

  public hostDisconnected(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this._surface = undefined;
    this._releasePointers();
    this._dragStart = undefined;
    this._pinchStart = undefined;
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
      this._interacting = this.zoomed;
      if (this.zoomed) event.preventDefault();
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
    if (!drag || drag.pointerId !== event.pointerId || !this.zoomed) return;
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
      event.preventDefault();
      this._toggleAt(centerX, centerY);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      this._setScaleAt(this._scale + WHEEL_ZOOM_STEP, centerX, centerY);
    } else if (event.key === "-") {
      event.preventDefault();
      this._setScaleAt(this._scale - WHEEL_ZOOM_STEP, centerX, centerY);
    } else if (event.key === "0" || event.key === "Escape") {
      if (!this.zoomed) return;
      event.preventDefault();
      this.reset();
      return;
    } else if (this.zoomed && event.key.startsWith("Arrow")) {
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
    if (eligible) this._toggleAt(event.clientX, event.clientY);
    else this._host.requestUpdate();
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
    if (!this.zoomed) {
      this._panX = 0;
      this._panY = 0;
      return;
    }
    const rect = this._surface?.getBoundingClientRect();
    if (!rect) return;
    const maxX = (rect.width * (this._scale - 1)) / 2;
    const maxY = (rect.height * (this._scale - 1)) / 2;
    this._panX = Math.min(maxX, Math.max(-maxX, this._panX));
    this._panY = Math.min(maxY, Math.max(-maxY, this._panY));
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
