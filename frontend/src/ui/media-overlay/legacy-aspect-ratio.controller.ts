import type { ReactiveController, ReactiveControllerHost } from "lit";

const DEFAULT_HEIGHT_RATIO = 9 / 16;

function nativeAspectRatioSupported(): boolean {
  return (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("aspect-ratio", "16 / 9")
  );
}

/** Supplies explicit pixel height where legacy engines lack CSS aspect-ratio. */
export class LegacyAspectRatioController implements ReactiveController {
  private _element?: HTMLElement;
  private _heightRatio = DEFAULT_HEIGHT_RATIO;
  private readonly _native = nativeAspectRatioSupported();
  private readonly _observer?: ResizeObserver;

  public constructor(host: ReactiveControllerHost) {
    host.addController(this);
    if (!this._native && typeof ResizeObserver !== "undefined") {
      this._observer = new ResizeObserver(() => this._sync());
    }
  }

  public observe(
    element: HTMLElement | undefined,
    heightRatio = DEFAULT_HEIGHT_RATIO,
  ): void {
    if (this._native) return;
    const normalizedRatio =
      Number.isFinite(heightRatio) && heightRatio > 0
        ? heightRatio
        : DEFAULT_HEIGHT_RATIO;
    if (this._element !== element) {
      this._clear();
      this._element = element;
      if (element) this._observer?.observe(element);
    }
    this._heightRatio = normalizedRatio;
    this._sync();
  }

  public hostDisconnected(): void {
    this._clear();
  }

  private _sync(): void {
    const element = this._element;
    if (!element) return;
    const width = element.getBoundingClientRect().width;
    if (!(width > 0)) return;
    const height = `${width * this._heightRatio}px`;
    if (element.style.height !== height) element.style.height = height;
  }

  private _clear(): void {
    if (!this._element) return;
    this._observer?.unobserve(this._element);
    this._element.style.removeProperty("height");
    this._element = undefined;
  }
}
