import type { ReactiveController, ReactiveControllerHost } from "lit";
import type Swiper from "swiper";
import type { SlideTransition } from "../../../core/config";

import {
  CAMERA_CAROUSEL_NAVIGATION_HEIGHT_RATIO,
  CAMERA_CAROUSEL_NAVIGATION_MAX_SIZE_PX,
  CAMERA_CAROUSEL_NAVIGATION_MIN_SIZE_PX,
} from "./constants";

/** Owns the camera-local Swiper instance without owning slides or selection. */
export class CameraCarouselController implements ReactiveController {
  private _activeIndex = 0;
  private _container?: HTMLElement;
  private _generation = 0;
  private _slideCount = 0;
  private _interactionLocked = false;
  private _resizeObserver?: ResizeObserver;
  private _swiper?: Swiper;
  private _transition: SlideTransition = "slide";

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _onSelectionChanged?: (
      index: number,
      settled: boolean,
    ) => void,
  ) {
    _host.addController(this);
  }

  public observe(
    container: HTMLElement | undefined,
    slideCount: number,
    activeIndex = 0,
    transition: SlideTransition = "slide",
  ): void {
    const normalizedCount = Math.max(0, Math.trunc(slideCount));
    this._activeIndex = Math.max(
      0,
      Math.min(normalizedCount - 1, Math.trunc(activeIndex)),
    );
    if (this._container === container && this._transition === transition) {
      this._setSlideCount(normalizedCount);
      if (
        this._swiper &&
        !this._swiper.destroyed &&
        this._swiper.activeIndex !== this._activeIndex
      ) {
        this._swiper.slideTo(this._activeIndex, 0, false);
      }
      return;
    }
    this._transition = transition;
    this._replaceContainer(container, normalizedCount);
  }

  public hostConnected(): void {
    this._host.requestUpdate();
  }

  public hostDisconnected(): void {
    this._replaceContainer(undefined, 0);
  }

  public next(): void {
    if (this._swiper) this._swiper.slideNext();
    else
      this._onSelectionChanged?.(
        Math.min(this._slideCount - 1, this._activeIndex + 1),
        true,
      );
  }

  public previous(): void {
    if (this._swiper) this._swiper.slidePrev();
    else this._onSelectionChanged?.(Math.max(0, this._activeIndex - 1), true);
  }

  public select(index: number): void {
    const next = Math.max(0, Math.min(this._slideCount - 1, Math.trunc(index)));
    if (next === this._activeIndex) return;
    if (this._swiper && !this._swiper.destroyed) {
      this._swiper.slideTo(next);
      return;
    }
    this._activeIndex = next;
    this._onSelectionChanged?.(next, true);
  }

  public setInteractionLocked(locked: boolean): void {
    if (this._interactionLocked === locked) return;
    this._interactionLocked = locked;
    this._syncInteraction();
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
    if (container) {
      this._observeSize(container);
      void this._initialize(container, generation);
    }
  }

  private async _initialize(
    container: HTMLElement,
    generation: number,
  ): Promise<void> {
    try {
      const { default: SwiperConstructor } = await import("swiper");
      const fadeModule =
        this._transition === "fade"
          ? (await import("swiper/modules")).EffectFade
          : undefined;
      if (generation !== this._generation || this._container !== container)
        return;
      this._swiper = new SwiperConstructor(container, {
        allowTouchMove: this._canMove(),
        effect: this._transition === "fade" ? "fade" : "slide",
        initialSlide: this._activeIndex,
        modules: fadeModule ? [fadeModule] : [],
        nested: true,
        noSwiping: true,
        noSwipingClass: "swiper-no-swiping",
        on: {
          slideChange: (swiper) => {
            const selectionChanged = swiper.activeIndex !== this._activeIndex;
            this._activeIndex = swiper.activeIndex;
            // Camera-bar selection updates the requested index before Swiper
            // performs its zero-duration DOM synchronization. That internal
            // slideChange is already settled and must not replace the shared
            // selection state with a transition that can never end.
            if (selectionChanged) {
              this._onSelectionChanged?.(swiper.activeIndex, false);
            }
          },
          slideChangeTransitionEnd: (swiper) => {
            this._activeIndex = swiper.activeIndex;
            this._onSelectionChanged?.(swiper.activeIndex, true);
          },
        },
        resizeObserver: true,
        speed: this._transition === "none" ? 0 : 300,
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
    this._syncInteractionClass();
    if (!this._swiper || this._swiper.destroyed) return;
    this._swiper.allowTouchMove = this._canMove();
    this._swiper.params.allowTouchMove = this._canMove();
    this._swiper.update();
  }

  private _syncInteractionClass(): void {
    this._container?.classList.toggle(
      "camera-carousel-interactive",
      this._slideCount > 1,
    );
  }

  private _canMove(): boolean {
    return this._slideCount > 1 && !this._interactionLocked;
  }

  private _syncInteraction(): void {
    this._syncInteractionClass();
    if (!this._swiper || this._swiper.destroyed) return;
    this._swiper.allowTouchMove = this._canMove();
    this._swiper.params.allowTouchMove = this._canMove();
  }

  private _observeSize(container: HTMLElement): void {
    this._syncNavigationSize();
    if (typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(() => this._syncNavigationSize());
    this._resizeObserver.observe(container);
  }

  private _syncNavigationSize(): void {
    const container = this._container;
    if (!container) return;
    const size = Math.min(
      CAMERA_CAROUSEL_NAVIGATION_MAX_SIZE_PX,
      Math.max(
        CAMERA_CAROUSEL_NAVIGATION_MIN_SIZE_PX,
        container.getBoundingClientRect().height *
          CAMERA_CAROUSEL_NAVIGATION_HEIGHT_RATIO,
      ),
    );
    container.style.setProperty(
      "--wzc-carousel-navigation-icon-size",
      `${size}px`,
    );
  }

  private _destroy(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this._container?.style.removeProperty(
      "--wzc-carousel-navigation-icon-size",
    );
    this._container?.classList.remove("camera-carousel-interactive");
    if (this._swiper && !this._swiper.destroyed) {
      this._swiper.destroy(true, true);
    }
    this._swiper = undefined;
  }
}
