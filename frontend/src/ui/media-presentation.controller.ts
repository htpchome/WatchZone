import type { ReactiveController, ReactiveControllerHost } from "lit";

import {
  MediaOverlayVisibilityController,
  type MediaOverlayVisibilityOptions,
} from "./media-overlay-visibility.controller";
import { MediaZoomController } from "./media-zoom.controller";
import {
  mediaInteractionOriginatesFromControl,
  MediaTouchGestureController,
} from "./media-touch-gesture.controller";

const DOUBLE_ACTIVATION_DELAY_MS = 450;
const DOUBLE_ACTIVATION_DISTANCE_PX = 48;
const NATIVE_DOUBLE_CLICK_SUPPRESSION_MS = 800;

interface CompletedActivation {
  readonly time: number;
  readonly x: number;
  readonly y: number;
}

export interface MediaPresentationOptions extends MediaOverlayVisibilityOptions {
  readonly dismissOverlayOnOutsidePointer?: boolean;
}

/** Owns identical overlay and zoom interaction for every video presentation. */
export class MediaPresentationController implements ReactiveController {
  public readonly overlay: MediaOverlayVisibilityController;
  public readonly touch: MediaTouchGestureController;
  public readonly zoom: MediaZoomController;

  private _surface?: HTMLElement;
  private _active = true;
  private _lastActivation?: CompletedActivation;
  private _lastZoomActivationTime = Number.NEGATIVE_INFINITY;
  private _outsidePointerTimer?: ReturnType<typeof setTimeout>;
  private _overlayInteractionEnabled = true;
  private _touchClickPending = false;

  public constructor(
    host: ReactiveControllerHost,
    private readonly _options: MediaPresentationOptions = {},
  ) {
    host.addController(this);
    this.overlay = new MediaOverlayVisibilityController(host, _options);
    this.zoom = new MediaZoomController(host);
    this.touch = new MediaTouchGestureController(this.zoom);
  }

  public hostConnected(): void {
    if (this._options.dismissOverlayOnOutsidePointer) {
      document.addEventListener("pointerdown", this._handleDocumentPointerDown);
    }
  }

  public observe(
    surface: HTMLElement | undefined,
    presentationTarget: HTMLElement | undefined = surface,
  ): void {
    if (surface !== this._surface) {
      this._surface?.removeEventListener(
        "dblclick",
        this._preventNativeDoubleClick,
        true,
      );
      this._surface = surface;
      surface?.addEventListener(
        "dblclick",
        this._preventNativeDoubleClick,
        true,
      );
    }
    this.zoom.observe(surface, presentationTarget);
  }

  public configure(key: string | undefined): void {
    this._resetActivationState();
    this.touch.reset();
    this.zoom.configure(key);
    this._resetOverlayAfterZoom();
  }

  /** Transfers interaction ownership at a camera-selection boundary. */
  public setActive(active: boolean): void {
    if (this._active === active) return;
    this._active = active;
    this._resetActivationState();
    this.touch.reset();
    this.zoom.cancelInteraction();
    if (!active) this.zoom.reset();
    this.overlay.setActive(active);
  }

  public resetZoom(): void {
    this._resetActivationState();
    this.touch.reset();
    this.zoom.reset();
    this._resetOverlayAfterZoom();
  }

  public endStageResizeReturn(): void {
    this.zoom.endStageResizeReturn();
    this.overlay.hide();
  }

  public hostDisconnected(): void {
    this._resetActivationState();
    this.touch.reset();
    if (this._outsidePointerTimer !== undefined) {
      clearTimeout(this._outsidePointerTimer);
      this._outsidePointerTimer = undefined;
    }
    document.removeEventListener(
      "pointerdown",
      this._handleDocumentPointerDown,
    );
    this._surface?.removeEventListener(
      "dblclick",
      this._preventNativeDoubleClick,
      true,
    );
    this._surface = undefined;
  }

  public readonly handlePointerDown = (event: PointerEvent): void => {
    this._touchClickPending = false;
    if (mediaInteractionOriginatesFromControl(event)) this._clearActivation();
    if (this.touch.handlePointerDown(event)) return;
    this.zoom.handlePointerDown(event);
    if (this._overlayInteractionEnabled) this.overlay.handlePointerDown(event);
  };

  public readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.touch.handlePointerMove(event)) {
      if (this.zoom.interacting) this._clearActivation();
      if (this._overlayInteractionEnabled && this.zoom.interacting) {
        this.overlay.revealFromTouch();
      }
      return;
    }
    this.zoom.handlePointerMove(event);
    if (this.zoom.interacting) this._clearActivation();
    if (this._overlayInteractionEnabled && !this.zoom.interacting)
      this.overlay.handlePointerMove(event);
  };

  public readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.touch.handlePointerUp(event)) {
      if (this.touch.consumeSurfaceActivation()) {
        this._touchClickPending = true;
        if (this._completeActivation(event.clientX, event.clientY)) {
          event.preventDefault();
        }
      }
      this._surface?.blur();
      return;
    }
    this.zoom.handlePointerUp(event);
    if (this._overlayInteractionEnabled) this.overlay.handlePointerEnd(event);
  };

  public readonly handlePointerCancel = (event: PointerEvent): void => {
    this._touchClickPending = false;
    this._clearActivation();
    if (this.touch.handlePointerCancel(event)) return;
    this.zoom.handlePointerCancel(event);
    if (this._overlayInteractionEnabled) this.overlay.handlePointerEnd(event);
  };

  public readonly handleLostPointerCapture = (event: PointerEvent): void => {
    if (this.touch.handleLostPointerCapture(event)) {
      this._touchClickPending = false;
      this._clearActivation();
      return;
    }
    this.zoom.handleLostPointerCapture(event);
    if (this._overlayInteractionEnabled) this.overlay.handlePointerEnd(event);
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
    if (!this._overlayInteractionEnabled) return;
    if (touchActivation) {
      this.overlay.revealFromTouch();
      return;
    }
    this.overlay.reveal();
  };

  public readonly handleWheel = (event: WheelEvent): void =>
    this.zoom.handleWheel(event);

  public readonly handleKeyDown = (event: KeyboardEvent): void =>
    this.zoom.handleKeyDown(event);

  public setOverlayInteractionEnabled(enabled: boolean): void {
    this._overlayInteractionEnabled = enabled;
  }

  private _resetOverlayAfterZoom(): void {
    this.overlay.hide();
  }

  private readonly _preventNativeDoubleClick = (event: MouseEvent): void => {
    if (
      performance.now() - this._lastZoomActivationTime <=
      NATIVE_DOUBLE_CLICK_SUPPRESSION_MS
    ) {
      event.preventDefault();
    } else {
      this.zoom.handleDoubleClick(event);
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
    this.zoom.toggleAt(clientX, clientY);
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

  private readonly _handleDocumentPointerDown = (event: PointerEvent): void => {
    if (this._outsidePointerTimer !== undefined) {
      clearTimeout(this._outsidePointerTimer);
      this._outsidePointerTimer = undefined;
    }
    if (!this._surface || event.composedPath().includes(this._surface)) return;
    // Let controls outside the live presentation finish their own activation
    // before a visibility update can remove them from the interaction tree.
    this._outsidePointerTimer = setTimeout(() => {
      this._outsidePointerTimer = undefined;
      this.overlay.hide();
    }, 0);
  };
}
