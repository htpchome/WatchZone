import type { ReactiveController, ReactiveControllerHost } from "lit";
import type Swiper from "swiper";
import type { SlideTransition } from "../../../core/config";
import {
  animateElement,
  type MotionAnimation,
  motionDurations,
  motionEasings,
  reducedMotionRequested,
} from "../../../ui/motion";

import {
  CAMERA_CAROUSEL_NAVIGATION_HEIGHT_RATIO,
  CAMERA_CAROUSEL_NAVIGATION_MAX_SIZE_PX,
  CAMERA_CAROUSEL_NAVIGATION_MIN_SIZE_PX,
} from "./constants";

/** Owns the camera-local Swiper instance without owning slides or selection. */
export class CameraCarouselController implements ReactiveController {
  private _activeIndex = 0;
  private readonly _animations = new Set<MotionAnimation>();
  private _container?: HTMLElement;
  private _generation = 0;
  private _slideCount = 0;
  private _interactionLocked = false;
  private _resizeFrame?: number;
  private _resizeObserver?: ResizeObserver;
  private _swiper?: Swiper;
  private _touchReleaseTransform?: string;
  private _transitionGeneration = 0;
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
    this._onSelectionChanged?.(this._activeIndex, true);
    this._host.requestUpdate();
  }

  public hostDisconnected(): void {
    this._replaceContainer(undefined, 0);
  }

  public next(): void {
    this.select(Math.min(this._slideCount - 1, this._activeIndex + 1));
  }

  public previous(): void {
    this.select(Math.max(0, this._activeIndex - 1));
  }

  public select(index: number): void {
    const next = Math.max(0, Math.min(this._slideCount - 1, Math.trunc(index)));
    if (next === this._activeIndex) {
      this._onSelectionChanged?.(next, true);
      return;
    }
    if (this._swiper && !this._swiper.destroyed) {
      if (this._swiper.activeIndex === next) {
        this._onSelectionChanged?.(next, true);
        return;
      }
      const fromIndex = this._swiper.activeIndex;
      const fromTransform = getComputedStyle(this._swiper.wrapperEl).transform;
      this._swiper.slideTo(next, 0, false);
      this._onSelectionChanged?.(next, false);
      this._animateSelection(this._swiper, fromIndex, next, fromTransform);
      return;
    }
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
            // Camera-bar selection updates the requested index before Swiper
            // performs its zero-duration DOM synchronization. That internal
            // slideChange is already settled and must not replace the shared
            // selection state with a transition that can never end.
            if (selectionChanged) {
              this._onSelectionChanged?.(swiper.activeIndex, false);
              this._animateSelection(
                swiper,
                swiper.previousIndex,
                swiper.activeIndex,
                this._touchReleaseTransform,
              );
              this._touchReleaseTransform = undefined;
            }
          },
          touchEnd: (swiper) => {
            this._touchReleaseTransform = getComputedStyle(
              swiper.wrapperEl,
            ).transform;
          },
        },
        resizeObserver: true,
        speed: 0,
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

  private _animateSelection(
    swiper: Swiper,
    fromIndex: number,
    toIndex: number,
    fromTransform?: string,
  ): void {
    this._cancelAnimations();
    const generation = ++this._transitionGeneration;
    if (this._transition === "none" || reducedMotionRequested()) {
      this._onSelectionChanged?.(toIndex, true);
      return;
    }
    const animations: MotionAnimation[] = [];
    const slides = [...swiper.slides] as HTMLElement[];
    const outgoing = slides[fromIndex];
    const incoming = slides[toIndex];
    let remaining =
      this._transition === "fade"
        ? Number(Boolean(outgoing)) + Number(Boolean(incoming))
        : 1;
    if (remaining === 0) {
      this._onSelectionChanged?.(toIndex, true);
      return;
    }
    const complete = () => {
      remaining -= 1;
      if (remaining > 0 || generation !== this._transitionGeneration) return;
      this._onSelectionChanged?.(toIndex, true);
      for (const animation of animations) {
        animation.cancel();
        this._animations.delete(animation);
      }
    };
    if (this._transition === "fade") {
      if (outgoing) {
        animations.push(
          animateElement(
            outgoing,
            { opacity: [1, 0] },
            {
              duration: motionDurations.carousel,
              ease: motionEasings.standard,
              onComplete: complete,
            },
          ),
        );
      }
      if (incoming) {
        animations.push(
          animateElement(
            incoming,
            { opacity: [0, 1] },
            {
              duration: motionDurations.carousel,
              ease: motionEasings.standard,
              onComplete: complete,
            },
          ),
        );
      }
    } else {
      const wrapper = swiper.wrapperEl;
      const targetTransform = getComputedStyle(wrapper).transform;
      animations.push(
        animateElement(
          wrapper,
          {
            transform: [
              fromTransform && fromTransform !== "none"
                ? fromTransform
                : targetTransform,
              targetTransform,
            ],
          },
          {
            duration: motionDurations.carousel,
            ease: motionEasings.standard,
            onComplete: complete,
          },
        ),
      );
    }
    for (const animation of animations) this._animations.add(animation);
  }

  private _cancelAnimations(): void {
    this._transitionGeneration += 1;
    for (const animation of this._animations) animation.cancel();
    this._animations.clear();
  }

  private _observeSize(container: HTMLElement): void {
    this._syncNavigationSize();
    if (typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(() => {
      if (this._resizeFrame !== undefined)
        cancelAnimationFrame(this._resizeFrame);
      this._resizeFrame = requestAnimationFrame(() => {
        this._resizeFrame = undefined;
        this._syncNavigationSize();
      });
    });
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
    this._cancelAnimations();
    if (this._resizeFrame !== undefined)
      cancelAnimationFrame(this._resizeFrame);
    this._resizeFrame = undefined;
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
