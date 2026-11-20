import type { ReactiveController, ReactiveControllerHost } from "lit";

import { ZoomTransformController } from "./transform.controller";
import {
  mediaInteractionOriginatesFromControl,
  ZoomTouchGestureInterpreter,
} from "./touch-gesture";

const DOUBLE_ACTIVATION_DELAY_MS = 450;
const DOUBLE_ACTIVATION_DISTANCE_PX = 48;
const NATIVE_DOUBLE_CLICK_SUPPRESSION_MS = 800;

interface CompletedActivation {
  readonly time: number;
  readonly x: number;
  readonly y: number;
}

export interface ZoomControllerOptions {
  readonly onActivation?: (input: "pointer" | "touch") => void;
  readonly onTouchInteraction?: () => void;
}

/** Public attachment and lifecycle boundary for one local zoomable surface. */
export class ZoomController implements ReactiveController {
  private _surface?: HTMLElement;
  private _active = true;
  private _lastActivation?: CompletedActivation;
  private _lastZoomActivationTime = Number.NEGATIVE_INFINITY;
  private _touchClickPending = false;
  private readonly _touch: ZoomTouchGestureInterpreter;
  private readonly _zoom: ZoomTransformController;

  public constructor(
    host: ReactiveControllerHost,
    private readonly _options: ZoomControllerOptions = {},
  ) {
    host.addController(this);
    this._zoom = new ZoomTransformController(host);
    this._touch = new ZoomTouchGestureInterpreter(this._zoom);
  }

  public get interacting(): boolean {
    return this._zoom.interacting;
  }

  public get pannable(): boolean {
    return this._zoom.pannable;
  }

  public get scale(): number {
    return this._zoom.scale;
  }

  public get stageResizeActive(): boolean {
    return this._zoom.stageResizeActive;
  }

  /**
   * The sole DOM attachment boundary for media interaction.
   *
   * The viewport owns input and clipping. The presentation target is one
   * stable wrapper inside that viewport and is the only transformed node.
   */
  public attach(
    surface: HTMLElement | undefined,
    presentationTarget: HTMLElement | undefined = surface,
  ): void {
    if (surface !== this._surface) {
      this._detachSurface();
      this._surface = surface;
      this._attachSurface();
    }
    this._zoom.attach(surface, presentationTarget);
  }

  public setBasePresentationScale(scale: number): void {
    this._zoom.setBasePresentationScale(scale);
  }

  public setMediaDimensions(width: number, height: number): void {
    this._zoom.setMediaDimensions(width, height);
  }

  public beginStageResizeReturn(): void {
    this._zoom.beginStageResizeReturn();
  }

  public updateStageResizeReturn(progress: number): void {
    this._zoom.updateStageResizeReturn(progress);
  }

  public configure(key: string | undefined): void {
    this._resetActivationState();
    this._touch.reset();
    this._zoom.configure(key);
  }

  /** Transfers interaction ownership at a camera-selection boundary. */
  public setActive(active: boolean): void {
    if (this._active === active) return;
    this._active = active;
    this._resetActivationState();
    this._touch.reset();
    this._zoom.cancelInteraction();
    if (!active) this._zoom.reset();
  }

  public resetZoom(): void {
    this._resetActivationState();
    this._touch.reset();
    this._zoom.reset();
  }

  public endStageResizeReturn(): void {
    this._zoom.endStageResizeReturn();
  }

  public hostDisconnected(): void {
    this._resetActivationState();
    this._touch.reset();
    this._detachSurface();
    this._surface = undefined;
  }

  public readonly handlePointerDown = (event: PointerEvent): void => {
    this._touchClickPending = false;
    if (mediaInteractionOriginatesFromControl(event)) this._clearActivation();
    if (this._touch.handlePointerDown(event)) return;
    this._zoom.handlePointerDown(event);
  };

  public readonly handlePointerMove = (event: PointerEvent): void => {
    if (this._touch.handlePointerMove(event)) {
      if (this._zoom.interacting) this._clearActivation();
      if (this._zoom.interacting) this._options.onTouchInteraction?.();
      return;
    }
    this._zoom.handlePointerMove(event);
    if (this._zoom.interacting) this._clearActivation();
  };

  public readonly handlePointerUp = (event: PointerEvent): void => {
    if (this._touch.handlePointerUp(event)) {
      if (this._touch.consumeSurfaceActivation()) {
        this._touchClickPending = true;
        if (this._completeActivation(event.clientX, event.clientY)) {
          event.preventDefault();
        }
      }
      this._surface?.blur();
      return;
    }
    this._zoom.handlePointerUp(event);
  };

  public readonly handlePointerCancel = (event: PointerEvent): void => {
    this._touchClickPending = false;
    this._clearActivation();
    if (this._touch.handlePointerCancel(event)) return;
    this._zoom.handlePointerCancel(event);
  };

  public readonly handleLostPointerCapture = (event: PointerEvent): void => {
    if (this._touch.handleLostPointerCapture(event)) {
      this._touchClickPending = false;
      this._clearActivation();
      return;
    }
    this._zoom.handleLostPointerCapture(event);
  };

  public readonly handleClick = (event: MouseEvent): void => {
    if (mediaInteractionOriginatesFromControl(event)) {
      this._clearActivation();
      return;
    }
    const touchActivation = this._touchClickPending;
    this._touchClickPending = false;
    if (
      !touchActivation &&
      this._completeActivation(event.clientX, event.clientY)
    ) {
      event.preventDefault();
    }
    if (touchActivation) {
      this._options.onActivation?.("touch");
      return;
    }
    this._options.onActivation?.("pointer");
  };

  public readonly handleWheel = (event: WheelEvent): void =>
    this._zoom.handleWheel(event);

  public readonly handleKeyDown = (event: KeyboardEvent): void =>
    this._zoom.handleKeyDown(event);

  private _attachSurface(): void {
    const surface = this._surface;
    if (!surface) return;
    surface.addEventListener("pointerdown", this.handlePointerDown);
    surface.addEventListener("pointermove", this.handlePointerMove);
    surface.addEventListener("pointerup", this.handlePointerUp);
    surface.addEventListener("pointercancel", this.handlePointerCancel);
    surface.addEventListener(
      "lostpointercapture",
      this.handleLostPointerCapture,
    );
    surface.addEventListener("click", this.handleClick);
    surface.addEventListener("wheel", this.handleWheel);
    surface.addEventListener("keydown", this.handleKeyDown);
    surface.addEventListener("dblclick", this._preventNativeDoubleClick, true);
  }

  private _detachSurface(): void {
    const surface = this._surface;
    if (!surface) return;
    surface.removeEventListener("pointerdown", this.handlePointerDown);
    surface.removeEventListener("pointermove", this.handlePointerMove);
    surface.removeEventListener("pointerup", this.handlePointerUp);
    surface.removeEventListener("pointercancel", this.handlePointerCancel);
    surface.removeEventListener(
      "lostpointercapture",
      this.handleLostPointerCapture,
    );
    surface.removeEventListener("click", this.handleClick);
    surface.removeEventListener("wheel", this.handleWheel);
    surface.removeEventListener("keydown", this.handleKeyDown);
    surface.removeEventListener(
      "dblclick",
      this._preventNativeDoubleClick,
      true,
    );
  }

  private readonly _preventNativeDoubleClick = (event: MouseEvent): void => {
    if (
      performance.now() - this._lastZoomActivationTime <=
      NATIVE_DOUBLE_CLICK_SUPPRESSION_MS
    ) {
      event.preventDefault();
    } else {
      this._zoom.handleDoubleClick(event);
    }
    event.stopPropagation();
  };

  private _completeActivation(clientX: number, clientY: number): boolean {
    const now = performance.now();
    const previous = this._lastActivation;
    if (
      !previous ||
      now - previous.time > DOUBLE_ACTIVATION_DELAY_MS ||
      Math.hypot(clientX - previous.x, clientY - previous.y) >
        DOUBLE_ACTIVATION_DISTANCE_PX
    ) {
      this._lastActivation = {
        time: now,
        x: clientX,
        y: clientY,
      };
      return false;
    }

    this._lastActivation = undefined;
    this._lastZoomActivationTime = now;
    this._zoom.toggleAt(clientX, clientY);
    return true;
  }

  private _clearActivation(): void {
    this._lastActivation = undefined;
  }

  private _resetActivationState(): void {
    this._clearActivation();
    this._lastZoomActivationTime = Number.NEGATIVE_INFINITY;
    this._touchClickPending = false;
  }
}
