import type { ReactiveController, ReactiveControllerHost } from "lit";

import {
  isPrimaryControlPointer,
  releaseTouchFocus,
} from "./control-interaction";

interface PressInteractionCallbacks<Action> {
  actionFor(target: HTMLElement): Action | undefined;
  end(action: Action, cancelled: boolean): void;
  start(action: Action): void;
}

/** Owns reusable pointer-capture and keyboard press lifecycle. */
export class PressInteractionController<Action> implements ReactiveController {
  private _action?: Action;
  private _pointerId?: number;
  private _target?: HTMLElement;

  public constructor(
    host: ReactiveControllerHost,
    private readonly _callbacks: PressInteractionCallbacks<Action>,
  ) {
    host.addController(this);
  }

  public hostDisconnected(): void {
    this._finish(true);
  }

  public readonly handlePointerDown = (event: PointerEvent): void => {
    if (!isPrimaryControlPointer(event) || this._action !== undefined) return;
    const target = event.currentTarget as HTMLElement;
    const action = this._callbacks.actionFor(target);
    if (action === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    this._action = action;
    this._pointerId = event.pointerId;
    this._target = target;
    target.setPointerCapture(event.pointerId);
    this._listenForCancellation();
    this._callbacks.start(action);
  };

  public readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    releaseTouchFocus(event);
    this._finish(false);
  };

  public readonly handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    this._finish(true);
  };

  public readonly handleKeyDown = (event: KeyboardEvent): void => {
    if ((event.key !== " " && event.key !== "Enter") || event.repeat) return;
    if (this._action !== undefined) return;
    const target = event.currentTarget as HTMLElement;
    const action = this._callbacks.actionFor(target);
    if (action === undefined) return;
    event.preventDefault();
    this._action = action;
    this._target = target;
    this._listenForCancellation();
    this._callbacks.start(action);
  };

  public readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    this._finish(false);
  };

  public cancel(): void {
    this._finish(true);
  }

  private _finish(cancelled: boolean): void {
    const action = this._action;
    const pointerId = this._pointerId;
    const target = this._target;
    this._action = undefined;
    this._pointerId = undefined;
    this._target = undefined;
    this._removeCancellationListeners();
    if (pointerId !== undefined && target?.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
    if (action !== undefined) this._callbacks.end(action, cancelled);
  }

  private _listenForCancellation(): void {
    window.addEventListener("blur", this._cancelFromEnvironment);
    document.addEventListener("visibilitychange", this._cancelFromEnvironment);
  }

  private _removeCancellationListeners(): void {
    window.removeEventListener("blur", this._cancelFromEnvironment);
    document.removeEventListener(
      "visibilitychange",
      this._cancelFromEnvironment,
    );
  }

  private readonly _cancelFromEnvironment = (): void => {
    if (document.visibilityState === "visible" && document.hasFocus()) return;
    this._finish(true);
  };
}
