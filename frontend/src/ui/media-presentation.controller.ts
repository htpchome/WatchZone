import type { ReactiveController, ReactiveControllerHost } from "lit";

import {
  MediaOverlayVisibilityController,
  type MediaOverlayVisibilityOptions,
} from "./media-overlay-visibility.controller";
import { MediaZoomController } from "./media-zoom.controller";

/** Owns identical overlay and zoom interaction for every video presentation. */
export class MediaPresentationController implements ReactiveController {
  public readonly overlay: MediaOverlayVisibilityController;
  public readonly zoom: MediaZoomController;

  private _surface?: HTMLElement;

  public constructor(
    host: ReactiveControllerHost,
    options: MediaOverlayVisibilityOptions = {},
  ) {
    host.addController(this);
    this.overlay = new MediaOverlayVisibilityController(host, options);
    this.zoom = new MediaZoomController(host, {
      onInteraction: () => this._handleMediaInteraction(),
    });
  }

  public observe(surface: HTMLElement | undefined): void {
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
    this.zoom.observe(surface);
  }

  public configure(key: string | undefined): void {
    this.zoom.configure(key);
    this._resetOverlayAfterZoom();
  }

  public resetZoom(): void {
    this.zoom.reset();
    this._resetOverlayAfterZoom();
  }

  public endStageResizeReturn(): void {
    this.zoom.endStageResizeReturn();
    this.overlay.setSuppressed(this.zoom.zoomed);
    this.overlay.hide();
  }

  public hostDisconnected(): void {
    this._surface?.removeEventListener(
      "dblclick",
      this._preventNativeDoubleClick,
      true,
    );
    this._surface = undefined;
  }

  public readonly handlePointerDown = (event: PointerEvent): void => {
    this.zoom.handlePointerDown(event);
    this.overlay.handlePointerDown(event);
  };

  public readonly handlePointerMove = (event: PointerEvent): void => {
    this.zoom.handlePointerMove(event);
    if (!this.zoom.interacting) this.overlay.handlePointerMove(event);
  };

  public readonly handlePointerUp = (event: PointerEvent): void => {
    this.zoom.handlePointerUp(event);
    this.overlay.handlePointerEnd(event);
  };

  public readonly handlePointerCancel = (event: PointerEvent): void => {
    this.zoom.handlePointerCancel(event);
    this.overlay.handlePointerEnd(event);
  };

  public readonly handleWheel = (event: WheelEvent): void =>
    this.zoom.handleWheel(event);

  public readonly handleKeyDown = (event: KeyboardEvent): void =>
    this.zoom.handleKeyDown(event);

  private _handleMediaInteraction(): void {
    this.overlay.setSuppressed(this.zoom.zoomed);
    this.overlay.hide();
  }

  private _resetOverlayAfterZoom(): void {
    this.overlay.setSuppressed(false);
    this.overlay.hide();
  }

  private readonly _preventNativeDoubleClick = (event: MouseEvent): void => {
    this.zoom.handleDoubleClick(event);
    event.stopPropagation();
  };
}
