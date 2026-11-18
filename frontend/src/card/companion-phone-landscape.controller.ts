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

const installedHosts = new WeakSet<LandscapeHost>();
const SURFACE_SETTLE_DURATION_MS = 180;
const SURFACE_SETTLE_EASING = "cubic-bezier(.2,.8,.2,1)";
const MAX_SURFACE_SETTLE_TRANSLATION_PX = 96;

export function installCompanionPhoneLandscape(
  host: LandscapeHost,
  canActivate: CanActivate,
  orientationChanged: OrientationChanged,
  localize: LocalizeFunction,
): void {
  if (installedHosts.has(host)) return;
  installedHosts.add(host);
  new CompanionPhoneLandscapeController(
    host,
    canActivate,
    orientationChanged,
    localize,
  );
}

/** Owns the Companion-phone in-flow landscape Stage transition. */
class CompanionPhoneLandscapeController implements ReactiveController {
  private _active = false;
  private _animation?: Animation;
  private _connected = false;
  private _initialized = false;
  private readonly _pull: CompanionCameraPullController;
  private _target = false;
  private _transitionGeneration = 0;
  private _transitioning = false;

  public constructor(
    private readonly _host: LandscapeHost,
    private readonly _canActivate: CanActivate,
    private readonly _orientationChanged: OrientationChanged,
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
    if (!animate && !target) return;
    void this._transition(target, generation, animate);
  };

  private _targetActive(): boolean {
    return window.innerWidth > window.innerHeight && this._canActivate();
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
    if (
      Math.abs(measured) < 0.5 ||
      Math.abs(measured) > MAX_SURFACE_SETTLE_TRANSLATION_PX
    ) {
      return;
    }
    const animation = surface.animate(
      [
        { transform: `translate3d(0, ${measured}px, 0)` },
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
    this._host.classList.add("companion-phone-orientation-transitioning");

    this._pull.deactivate();

    this._active = active;
    this._host.classList.toggle("companion-phone-landscape", active);
    this._orientationChanged(active);
    await this._host.updateComplete;
    if (!this._isCurrent(active, generation)) return;
    if (animate) await this._playSurfaceSettle(first);

    if (!this._isCurrent(active, generation)) return;
    this._transitioning = false;
    this._host.classList.remove("companion-phone-orientation-transitioning");
    if (active) {
      this._pull.activate();
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
}
