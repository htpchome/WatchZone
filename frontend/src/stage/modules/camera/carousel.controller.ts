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
  CAMERA_CAROUSEL_SLIDE_GAP_PX,
} from "./constants";

/** Owns the camera-local Swiper instance without owning slides or selection. */
export class CameraCarouselController implements ReactiveController {
  private _activeIndex = 0;
  private readonly _animations = new Set<MotionAnimation>();
  private readonly _boundaryElements = new Set<HTMLElement>();
  private _boundaryFrame?: number;
  private _boundaryTarget?: number;
  private _container?: HTMLElement;
  private _generation = 0;
  private _slideCount = 0;
  private _interactionLocked = false;
  private _nativeFullscreenActive = false;
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
      if (normalizedCount !== this._slideCount) {
        this._replaceContainer(container, normalizedCount);
        return;
      }
      if (
        this._swiper &&
        !this._swiper.destroyed &&
        this._boundaryTarget !== this._activeIndex &&
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
    if (this._slideCount < 2) return;
    this.select((this._activeIndex + 1) % this._slideCount);
  }

  public previous(): void {
    if (this._slideCount < 2) return;
    this.select((this._activeIndex - 1 + this._slideCount) % this._slideCount);
  }

  public select(index: number): void {
    const next = Math.max(0, Math.min(this._slideCount - 1, Math.trunc(index)));
    if (next === this._activeIndex) {
      this._onSelectionChanged?.(next, true);
      return;
    }
    if (
      this._swiper &&
      !this._swiper.destroyed &&
      this._isBoundaryMove(this._activeIndex, next)
    ) {
      this._animateBoundarySelection(this._swiper, next);
      return;
    }
    this._activeIndex = next;
    if (this._swiper && !this._swiper.destroyed) {
      if (this._swiper.activeIndex === next) {
        this._onSelectionChanged?.(next, true);
        return;
      }
      const fromIndex = this._swiper.activeIndex;
      const fromTransform = getComputedStyle(this._swiper.wrapperEl).transform;
      this._swiper.slideTo(next, 0, false);
      this._onSelectionChanged?.(next, false);
      this._animateSelection(
        this._swiper,
        fromIndex,
        next,
        next,
        fromTransform,
      );
      return;
    }
    this._onSelectionChanged?.(next, true);
  }

  public setInteractionLocked(locked: boolean): void {
    if (this._interactionLocked === locked) return;
    this._interactionLocked = locked;
    this._syncInteraction();
  }

  public setNativeFullscreenActive(active: boolean): void {
    if (active === this._nativeFullscreenActive) return;
    this._nativeFullscreenActive = active;
    if (active) {
      if (this._resizeFrame !== undefined)
        cancelAnimationFrame(this._resizeFrame);
      this._resizeFrame = undefined;
      return;
    }
    this._scheduleResizeSync();
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
              this._activeIndex = swiper.activeIndex;
              this._onSelectionChanged?.(swiper.activeIndex, false);
              this._animateSelection(
                swiper,
                swiper.previousIndex,
                swiper.activeIndex,
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
            const target =
              Math.abs(swiper.touches.diff) >= 20 &&
              swiper.swipeDirection === "prev" &&
              swiper.activeIndex === 0
                ? this._slideCount - 1
                : Math.abs(swiper.touches.diff) >= 20 &&
                    swiper.swipeDirection === "next" &&
                    swiper.activeIndex === this._slideCount - 1
                  ? 0
                  : undefined;
            if (target !== undefined) {
              this._touchReleaseTransform = undefined;
              if (this._boundaryFrame !== undefined) {
                cancelAnimationFrame(this._boundaryFrame);
              }
              this._boundaryFrame = requestAnimationFrame(() => {
                this._boundaryFrame = undefined;
                if (swiper.destroyed || swiper !== this._swiper) return;
                this._animateBoundarySelection(swiper, target);
              });
            }
          },
        },
        resizeObserver: false,
        spaceBetween: CAMERA_CAROUSEL_SLIDE_GAP_PX,
        speed: 0,
        touchStartPreventDefault: false,
        updateOnWindowResize: false,
        watchOverflow: true,
      });
    } catch {
      // The structural single-slide fallback remains fully usable without JS.
    }
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

  private _isBoundaryMove(fromIndex: number, toIndex: number): boolean {
    return (
      this._slideCount > 1 &&
      ((fromIndex === 0 && toIndex === this._slideCount - 1) ||
        (fromIndex === this._slideCount - 1 && toIndex === 0))
    );
  }

  private _animateBoundarySelection(swiper: Swiper, targetIndex: number): void {
    this._cancelAnimations();
    const fromIndex = swiper.activeIndex;
    const slides = [...swiper.slides] as HTMLElement[];
    const outgoing = slides[fromIndex];
    const incoming = slides[targetIndex];
    this._activeIndex = targetIndex;
    if (
      !outgoing ||
      !incoming ||
      this._transition === "none" ||
      reducedMotionRequested()
    ) {
      swiper.slideTo(targetIndex, 0, false);
      this._onSelectionChanged?.(targetIndex, true);
      return;
    }

    const outgoingRect = outgoing.getBoundingClientRect();
    const incomingRect = incoming.getBoundingClientRect();
    const travelDirection = targetIndex === 0 ? -1 : 1;
    const distance = outgoingRect.width + CAMERA_CAROUSEL_SLIDE_GAP_PX;
    const incomingStart =
      outgoingRect.left - travelDirection * distance - incomingRect.left;
    const incomingEnd = outgoingRect.left - incomingRect.left;
    const generation = ++this._transitionGeneration;
    const animations: MotionAnimation[] = [];
    let remaining = 2;
    this._boundaryTarget = targetIndex;
    this._boundaryElements.add(outgoing);
    this._boundaryElements.add(incoming);
    this._onSelectionChanged?.(targetIndex, false);

    const complete = () => {
      remaining -= 1;
      if (remaining > 0 || generation !== this._transitionGeneration) return;
      swiper.slideTo(targetIndex, 0, false);
      for (const animation of animations) {
        animation.cancel();
        this._animations.delete(animation);
      }
      this._clearBoundaryElementStyles();
      this._boundaryTarget = undefined;
      this._onSelectionChanged?.(targetIndex, true);
    };
    animations.push(
      animateElement(
        outgoing,
        this._transition === "fade"
          ? { opacity: [1, 0], transform: ["none", "none"] }
          : {
              transform: [
                "none",
                `translateX(${travelDirection * distance}px)`,
              ],
            },
        {
          duration: motionDurations.carousel,
          ease: motionEasings.standard,
          onComplete: complete,
        },
      ),
      animateElement(
        incoming,
        {
          opacity: this._transition === "fade" ? [0, 1] : [1, 1],
          transform: [
            `translateX(${incomingStart}px)`,
            `translateX(${incomingEnd}px)`,
          ],
        },
        {
          duration: motionDurations.carousel,
          ease: motionEasings.standard,
          onComplete: complete,
        },
      ),
    );
    for (const animation of animations) this._animations.add(animation);
  }

  private _animateSelection(
    swiper: Swiper,
    fromIndex: number,
    toIndex: number,
    selectedIndex: number,
    fromTransform?: string,
  ): void {
    this._cancelAnimations();
    const generation = ++this._transitionGeneration;
    if (this._transition === "none" || reducedMotionRequested()) {
      this._onSelectionChanged?.(selectedIndex, true);
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
      this._onSelectionChanged?.(selectedIndex, true);
      return;
    }
    const complete = () => {
      remaining -= 1;
      if (remaining > 0 || generation !== this._transitionGeneration) return;
      this._onSelectionChanged?.(selectedIndex, true);
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
    if (this._boundaryFrame !== undefined) {
      cancelAnimationFrame(this._boundaryFrame);
      this._boundaryFrame = undefined;
    }
    if (
      this._boundaryTarget !== undefined &&
      this._swiper &&
      !this._swiper.destroyed
    ) {
      this._swiper.slideTo(this._boundaryTarget, 0, false);
    }
    this._boundaryTarget = undefined;
    for (const animation of this._animations) animation.cancel();
    this._animations.clear();
    this._clearBoundaryElementStyles();
  }

  private _clearBoundaryElementStyles(): void {
    for (const element of this._boundaryElements) {
      element.style.removeProperty("opacity");
      element.style.removeProperty("transform");
    }
    this._boundaryElements.clear();
  }

  private _observeSize(container: HTMLElement): void {
    this._syncNavigationSize();
    if (typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(() => {
      this._scheduleResizeSync();
    });
    this._resizeObserver.observe(container);
  }

  private _scheduleResizeSync(): void {
    if (this._nativeFullscreenActive || this._resizeFrame !== undefined) return;
    this._resizeFrame = requestAnimationFrame(() => {
      this._resizeFrame = undefined;
      if (this._nativeFullscreenActive) return;
      this._swiper?.update();
      this._syncNavigationSize();
    });
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
