import type { ReactiveController, ReactiveControllerHost } from "lit";

/** Owns outside-dismiss, Escape, and trigger-focus restoration for popovers. */
export class PopoverInteractionController implements ReactiveController {
  public constructor(
    private readonly _host: ReactiveControllerHost & HTMLElement,
    private readonly _open: () => boolean,
    private readonly _setOpen: (open: boolean) => void,
    private readonly _triggerSelector: string,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    document.addEventListener("pointerdown", this._handleDocumentPointerDown);
    document.addEventListener("keydown", this._handleDocumentKeyDown);
  }

  public hostDisconnected(): void {
    document.removeEventListener(
      "pointerdown",
      this._handleDocumentPointerDown,
    );
    document.removeEventListener("keydown", this._handleDocumentKeyDown);
  }

  private readonly _handleDocumentPointerDown = (event: PointerEvent): void => {
    if (!this._open() || event.composedPath().includes(this._host)) return;
    this._setOpen(false);
  };

  private readonly _handleDocumentKeyDown = (event: KeyboardEvent): void => {
    if (!this._open() || event.key !== "Escape") return;
    this._setOpen(false);
    this._host.shadowRoot
      ?.querySelector<HTMLElement>(this._triggerSelector)
      ?.focus();
  };
}
