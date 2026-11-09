import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { ActiveCameraSession } from "./camera-session-context";

/** Shares camera-overlay reveal and hold behavior across portable controls. */
export class OverlayInteractionController implements ReactiveController {
  private _camera?: ActiveCameraSession;
  private _releaseHold?: () => void;

  public constructor(host: ReactiveControllerHost) {
    host.addController(this);
  }

  public configure(camera: ActiveCameraSession | undefined): void {
    if (camera?.entityId === this._camera?.entityId) {
      this._camera = camera;
      return;
    }
    this.release();
    this._camera = camera;
  }

  public hostDisconnected(): void {
    this.release();
    this._camera = undefined;
  }

  public reveal(): void {
    this._camera?.revealOverlay();
  }

  public readonly handlePointerEnter = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    this._hold();
  };

  public readonly handlePointerLeave = (): void => this.release();

  public readonly handleFocusIn = (): void => this._hold();

  public readonly handleFocusOut = (event: FocusEvent): void => {
    const owner = event.currentTarget as Node;
    if (owner.contains(event.relatedTarget as Node | null)) return;
    this.release();
  };

  public release(): void {
    this._releaseHold?.();
    this._releaseHold = undefined;
  }

  private _hold(): void {
    this._releaseHold ??= this._camera?.holdOverlay();
    this.reveal();
  }
}
