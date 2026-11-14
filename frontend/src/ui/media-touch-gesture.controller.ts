import type { MediaZoomController } from "./media-zoom.controller";

const DOUBLE_TAP_DELAY_MS = 450;
const DOUBLE_TAP_DISTANCE_PX = 48;
const TAP_DURATION_MS = 500;
const TAP_MOVE_TOLERANCE_PX = 14;
const SYNTHETIC_DOUBLE_CLICK_WINDOW_MS = 800;

interface Contact {
  moved: boolean;
  readonly startTime: number;
  readonly startX: number;
  readonly startY: number;
}

interface CompletedTap {
  readonly time: number;
  readonly x: number;
  readonly y: number;
}

export function mediaInteractionOriginatesFromControl(event: Event): boolean {
  return event
    .composedPath()
    .some(
      (target) =>
        target instanceof Element &&
        target.matches(
          "button, a, input, select, textarea, [role='button'], [data-media-touch-ignore]",
        ),
    );
}

/**
 * Sole interpreter for media touch gestures.
 *
 * Zoom owns transforms; the overlay owns its timer. This controller alone
 * decides whether a touch sequence is a tap, double tap, pan, or pinch.
 */
export class MediaTouchGestureController {
  private readonly _contacts = new Map<number, Contact>();
  private readonly _ignoredPointers = new Set<number>();
  private _lastCompletedTap?: CompletedTap;
  private _lastTouchToggleTime = Number.NEGATIVE_INFINITY;
  private _multiTouchSequence = false;
  private _surfaceActivationCompleted = false;

  public constructor(private readonly _zoom: MediaZoomController) {}

  public handlePointerDown(event: PointerEvent): boolean {
    this._surfaceActivationCompleted = false;
    if (event.pointerType !== "touch") return false;
    if (mediaInteractionOriginatesFromControl(event)) {
      this._lastCompletedTap = undefined;
      this._ignoredPointers.add(event.pointerId);
      return true;
    }

    this._contacts.set(event.pointerId, {
      moved: false,
      startTime: performance.now(),
      startX: event.clientX,
      startY: event.clientY,
    });
    if (this._contacts.size > 1) {
      this._multiTouchSequence = true;
      this._lastCompletedTap = undefined;
      for (const contact of this._contacts.values()) contact.moved = true;
    }
    this._zoom.handlePointerDown(event);
    return true;
  }

  public handlePointerMove(event: PointerEvent): boolean {
    if (event.pointerType !== "touch") return false;
    if (this._ignoredPointers.has(event.pointerId)) return true;
    const contact = this._contacts.get(event.pointerId);
    if (!contact) return true;
    if (
      Math.hypot(
        event.clientX - contact.startX,
        event.clientY - contact.startY,
      ) >= TAP_MOVE_TOLERANCE_PX
    ) {
      contact.moved = true;
      this._lastCompletedTap = undefined;
    }
    this._zoom.handlePointerMove(event);
    return true;
  }

  public handlePointerUp(event: PointerEvent): boolean {
    if (event.pointerType !== "touch") return false;
    if (this._ignoredPointers.delete(event.pointerId)) return true;
    const contact = this._contacts.get(event.pointerId);
    this._zoom.handlePointerUp(event);
    this._contacts.delete(event.pointerId);
    if (!contact) return true;

    const now = performance.now();
    const eligible =
      !this._multiTouchSequence &&
      !contact.moved &&
      now - contact.startTime <= TAP_DURATION_MS &&
      this._contacts.size === 0;
    if (eligible) {
      this._surfaceActivationCompleted = true;
      this._completeTap(event, now);
    } else {
      this._surfaceActivationCompleted = false;
      this._lastCompletedTap = undefined;
    }
    if (this._contacts.size === 0) this._multiTouchSequence = false;
    return true;
  }

  public handlePointerCancel(event: PointerEvent): boolean {
    if (event.pointerType !== "touch") return false;
    if (this._ignoredPointers.delete(event.pointerId)) return true;
    this._surfaceActivationCompleted = false;
    this._contacts.delete(event.pointerId);
    this._lastCompletedTap = undefined;
    this._zoom.handlePointerCancel(event);
    if (this._contacts.size === 0) this._multiTouchSequence = false;
    return true;
  }

  public handleLostPointerCapture(event: PointerEvent): boolean {
    if (event.pointerType !== "touch") return false;
    if (this._ignoredPointers.delete(event.pointerId)) return true;
    this._surfaceActivationCompleted = false;
    this._contacts.delete(event.pointerId);
    this._lastCompletedTap = undefined;
    this._zoom.handleLostPointerCapture(event);
    if (this._contacts.size === 0) this._multiTouchSequence = false;
    return true;
  }

  public suppressesSyntheticDoubleClick(): boolean {
    return (
      performance.now() - this._lastTouchToggleTime <=
      SYNTHETIC_DOUBLE_CLICK_WINDOW_MS
    );
  }

  public consumeSurfaceActivation(): boolean {
    const completed = this._surfaceActivationCompleted;
    this._surfaceActivationCompleted = false;
    return completed;
  }

  public reset(): void {
    this._contacts.clear();
    this._ignoredPointers.clear();
    this._lastCompletedTap = undefined;
    this._multiTouchSequence = false;
    this._surfaceActivationCompleted = false;
  }

  private _completeTap(event: PointerEvent, now: number): void {
    const previous = this._lastCompletedTap;
    const doubleTap = Boolean(
      previous &&
      now - previous.time <= DOUBLE_TAP_DELAY_MS &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <=
        DOUBLE_TAP_DISTANCE_PX,
    );
    if (!doubleTap) {
      this._lastCompletedTap = {
        time: now,
        x: event.clientX,
        y: event.clientY,
      };
      return;
    }

    this._lastCompletedTap = undefined;
    this._lastTouchToggleTime = now;
    event.preventDefault();
    this._zoom.toggleAt(event.clientX, event.clientY);
  }
}
