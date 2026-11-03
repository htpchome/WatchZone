import type { ReactiveController, ReactiveControllerHost } from "lit";
import type Swiper from "swiper";

/** Owns the camera-local Swiper instance without owning slides or selection. */
export class CameraCarouselController implements ReactiveController {
  private _container?: HTMLElement;
  private _generation = 0;
  private _slideCount = 0;
  private _swiper?: Swiper;

  public constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  public observe(container: HTMLElement | undefined, slideCount: number): void {
    const normalizedCount = Math.max(0, Math.trunc(slideCount));
    if (this._container === container) {
      this._setSlideCount(normalizedCount);
      return;
    }
    this._replaceContainer(container, normalizedCount);
  }

  public hostConnected(): void {
    this._host.requestUpdate();
  }

  public hostDisconnected(): void {
    this._replaceContainer(undefined, 0);
  }

  private _replaceContainer(
    container: HTMLElement | undefined,
    slideCount: number,
  ): void {
    const generation = ++this._generation;
    this._destroy();
    this._container = container;
    this._slideCount = slideCount;
    this._syncInteractionClass();
    if (container) void this._initialize(container, generation);
  }

  private async _initialize(
    container: HTMLElement,
    generation: number,
  ): Promise<void> {
    try {
      const { default: SwiperConstructor } = await import("swiper");
      if (generation !== this._generation || this._container !== container)
        return;
      this._swiper = new SwiperConstructor(container, {
        allowTouchMove: this._slideCount > 1,
        nested: true,
        resizeObserver: true,
        touchStartPreventDefault: false,
        watchOverflow: true,
      });
    } catch {
      // The structural single-slide fallback remains fully usable without JS.
    }
  }

  private _setSlideCount(slideCount: number): void {
    if (this._slideCount === slideCount) return;
    this._slideCount = slideCount;
    const allowTouchMove = slideCount > 1;
    this._syncInteractionClass();
    if (!this._swiper || this._swiper.destroyed) return;
    this._swiper.allowTouchMove = allowTouchMove;
    this._swiper.params.allowTouchMove = allowTouchMove;
    this._swiper.update();
  }

  private _syncInteractionClass(): void {
    this._container?.classList.toggle(
      "camera-carousel-interactive",
      this._slideCount > 1,
    );
  }

  private _destroy(): void {
    this._container?.classList.remove("camera-carousel-interactive");
    if (this._swiper && !this._swiper.destroyed) {
      this._swiper.destroy(true, true);
    }
    this._swiper = undefined;
  }
}
