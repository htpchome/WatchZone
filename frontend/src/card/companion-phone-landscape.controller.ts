import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { LocalizeFunction } from "../core/localization";
import { CompanionCameraPullController } from "./companion-camera-pull.controller";
import { companionPhoneLandscapeStyles } from "./companion-phone-landscape.styles";

interface LandscapeHost extends ReactiveControllerHost, HTMLElement {
  readonly renderRoot: DocumentFragment | HTMLElement;
  readonly updateComplete: Promise<boolean>;
}

type CanActivate = () => boolean;
type OrientationChanged = (active: boolean) => void;
type OrientationFlowAnchor = () => HTMLElement | undefined;

const installedHosts = new WeakSet<LandscapeHost>();
const SURFACE_SETTLE_DURATION_MS = 180;
const SURFACE_SETTLE_EASING = "cubic-bezier(.2,.8,.2,1)";
const PORTRAIT_ANCHOR_TOLERANCE_PX = 1;
const PORTRAIT_ANCHOR_WAIT_LIMIT_MS = 1_500;
const REQUIRED_STABLE_FRAMES = 3;
const MAX_SURFACE_SETTLE_TRANSLATION_PX = 96;

interface ViewportSnapshot {
  readonly height: number;
  readonly visualHeight: number;
  readonly visualWidth: number;
  readonly width: number;
}

function viewportSnapshot(): ViewportSnapshot {
  return {
    height: window.innerHeight,
    visualHeight: window.visualViewport?.height ?? window.innerHeight,
    visualWidth: window.visualViewport?.width ?? window.innerWidth,
    width: window.innerWidth,
  };
}

function sameViewport(
  first: ViewportSnapshot,
  second: ViewportSnapshot,
): boolean {
  return (
    first.height === second.height &&
    first.visualHeight === second.visualHeight &&
    first.visualWidth === second.visualWidth &&
    first.width === second.width
  );
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function installCompanionPhoneLandscape(
  host: LandscapeHost,
  canActivate: CanActivate,
  orientationChanged: OrientationChanged,
  orientationFlowAnchor: OrientationFlowAnchor,
  localize: LocalizeFunction,
): void {
  if (installedHosts.has(host)) return;
  installedHosts.add(host);
  new CompanionPhoneLandscapeController(
    host,
    canActivate,
    orientationChanged,
    orientationFlowAnchor,
    localize,
  );
}

/** Owns the Companion-phone viewport overlay and atomic Stage reflow. */
class CompanionPhoneLandscapeController implements ReactiveController {
  private _active = false;
  private _animation?: Animation;
  private _connected = false;
  private _initialized = false;
  private _portraitAnchorTop?: number;
  private readonly _pull: CompanionCameraPullController;
  private _target = false;
  private _transitionGeneration = 0;
  private _transitioning = false;

  public constructor(
    private readonly _host: LandscapeHost,
    private readonly _canActivate: CanActivate,
    private readonly _orientationChanged: OrientationChanged,
    private readonly _orientationFlowAnchor: OrientationFlowAnchor,
    localize: LocalizeFunction,
  ) {
    this._pull = new CompanionCameraPullController(_host, localize);
    _host.addController(this);
  }

  public hostConnected(): void {
    if (this._connected) return;
    this._connected = true;
    if (!this._host.renderRoot.querySelector("style[data-landscape-stage]")) {
      const style = document.createElement("style");
      style.dataset.landscapeStage = "";
      style.textContent = companionPhoneLandscapeStyles.cssText;
      this._host.renderRoot.append(style);
    }
    window.addEventListener("orientationchange", this._schedule);
    window.addEventListener("resize", this._schedule);
    window.visualViewport?.addEventListener("resize", this._schedule);
    this._schedule();
  }

  public hostUpdated(): void {
    if (this._active && !this._transitioning) this._pull.sync();
    if (!this._transitioning && this._targetActive() !== this._target) {
      this._schedule();
      return;
    }
    if (!this._active && !this._transitioning) this._capturePortraitAnchor();
  }

  public hostDisconnected(): void {
    this._connected = false;
    this._transitionGeneration += 1;
    window.removeEventListener("orientationchange", this._schedule);
    window.removeEventListener("resize", this._schedule);
    window.visualViewport?.removeEventListener("resize", this._schedule);
    this._pull.deactivate();
    this._cancelAnimation();
    this._host.classList.remove(
      "companion-phone-landscape",
      "companion-phone-orientation-overlay",
      "companion-phone-orientation-transitioning",
    );
    this._active = false;
    this._initialized = false;
    this._target = false;
    this._transitioning = false;
  }

  private readonly _schedule = (): void => {
    if (!this._connected) return;
    const target = this._targetActive();
    if (this._initialized && target === this._target) return;
    const animate = this._initialized;
    this._initialized = true;
    this._target = target;
    const generation = ++this._transitionGeneration;
    if (!animate && !target) {
      this._capturePortraitAnchor();
      return;
    }
    void this._transition(target, generation, animate);
  };

  private _targetActive(): boolean {
    return window.innerWidth > window.innerHeight && this._canActivate();
  }

  private _capturePortraitAnchor(): void {
    const anchor = this._orientationFlowAnchor();
    if (!anchor?.isConnected) return;
    const top = anchor.getBoundingClientRect().top;
    if (Number.isFinite(top)) this._portraitAnchorTop = top;
  }

  private _surfaceRect(): DOMRect | undefined {
    return this._host.renderRoot
      .querySelector<HTMLElement>("ha-card")
      ?.getBoundingClientRect();
  }

  private _cancelAnimation(): void {
    this._animation?.cancel();
    this._animation = undefined;
  }

  private async _playSurfaceSettle(first?: DOMRect): Promise<void> {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const surface = this._host.renderRoot.querySelector<HTMLElement>("ha-card");
    if (!surface) return;
    const last = surface.getBoundingClientRect();
    const measured = first ? first.top - last.top : 0;
    const translateY =
      Math.abs(measured) >= 0.5 &&
      Math.abs(measured) <= MAX_SURFACE_SETTLE_TRANSLATION_PX
        ? measured
        : 4;
    const animation = surface.animate(
      [
        { transform: `translate3d(0, ${translateY}px, 0)` },
        { transform: "none" },
      ],
      {
        duration: SURFACE_SETTLE_DURATION_MS,
        easing: SURFACE_SETTLE_EASING,
      },
    );
    this._animation = animation;
    await animation.finished.catch(() => undefined);
    if (this._animation === animation) this._animation = undefined;
  }

  private async _transition(
    active: boolean,
    generation: number,
    animate: boolean,
  ): Promise<void> {
    const first = animate ? this._surfaceRect() : undefined;
    this._cancelAnimation();
    this._transitioning = true;
    this._host.classList.add(
      "companion-phone-orientation-overlay",
      "companion-phone-orientation-transitioning",
    );

    if (active) {
      this._capturePortraitAnchor();
    } else {
      this._pull.deactivate();
    }

    this._active = active;
    this._host.classList.toggle("companion-phone-landscape", active);
    this._orientationChanged(active);
    await this._host.updateComplete;
    if (!this._isCurrent(active, generation)) return;

    if (!active) {
      await this._waitForPortraitFlow(generation);
      if (!this._isCurrent(active, generation)) return;
      const overlayRect = this._surfaceRect();
      this._host.classList.remove("companion-phone-orientation-overlay");
      await nextFrame();
      if (!this._isCurrent(active, generation)) return;
      if (animate) await this._playSurfaceSettle(overlayRect);
    } else if (animate) {
      await this._playSurfaceSettle(first);
    }

    if (!this._isCurrent(active, generation)) return;
    this._transitioning = false;
    this._host.classList.remove("companion-phone-orientation-transitioning");
    if (active) {
      this._pull.activate();
    } else {
      this._capturePortraitAnchor();
    }
  }

  private _isCurrent(active: boolean, generation: number): boolean {
    return (
      this._connected &&
      this._target === active &&
      this._active === active &&
      this._transitionGeneration === generation
    );
  }

  private async _waitForPortraitFlow(generation: number): Promise<void> {
    const started = performance.now();
    let previous = viewportSnapshot();
    let stableFrames = 0;
    while (this._isCurrent(false, generation)) {
      await nextFrame();
      const current = viewportSnapshot();
      stableFrames = sameViewport(previous, current) ? stableFrames + 1 : 0;
      previous = current;
      const anchor = this._orientationFlowAnchor();
      const anchorTop = anchor?.isConnected
        ? anchor.getBoundingClientRect().top
        : undefined;
      const anchorReady =
        this._portraitAnchorTop === undefined ||
        (anchorTop !== undefined &&
          Math.abs(anchorTop - this._portraitAnchorTop) <=
            PORTRAIT_ANCHOR_TOLERANCE_PX);
      if (
        current.width <= current.height &&
        stableFrames >= REQUIRED_STABLE_FRAMES &&
        anchorReady
      ) {
        return;
      }
      if (performance.now() - started >= PORTRAIT_ANCHOR_WAIT_LIMIT_MS) return;
    }
  }
}
