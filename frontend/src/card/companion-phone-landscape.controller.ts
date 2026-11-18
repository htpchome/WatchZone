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
const PORTRAIT_VIEWPORT_STABLE_FRAMES = 2;

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

/** Owns the Companion-phone full-viewport landscape Stage transition. */
class CompanionPhoneLandscapeController implements ReactiveController {
  private _active = false;
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
    if (!this._active && !this._transitioning) {
      this._capturePortraitFlowBlockSize();
    }
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
    this._host.classList.remove(
      "companion-phone-landscape",
      "companion-phone-orientation-overlay",
      "companion-phone-orientation-transitioning",
    );
    this._host.style.removeProperty("--wzc-companion-portrait-flow-block-size");
    this._active = false;
    this._initialized = false;
    this._target = false;
    this._transitioning = false;
  }

  private readonly _schedule = (): void => {
    if (!this._connected) return;
    const target = this._targetActive();
    if (this._initialized && target === this._target) return;
    const initialized = this._initialized;
    this._initialized = true;
    this._target = target;
    const generation = ++this._transitionGeneration;
    if (!initialized && !target) return;
    void this._transition(target, generation);
  };

  private _targetActive(): boolean {
    return window.innerWidth > window.innerHeight && this._canActivate();
  }

  private _capturePortraitFlowBlockSize(): void {
    const height = this._host.getBoundingClientRect().height;
    if (height <= 0) return;
    this._host.style.setProperty(
      "--wzc-companion-portrait-flow-block-size",
      `${height}px`,
    );
  }

  private async _transition(
    active: boolean,
    generation: number,
  ): Promise<void> {
    this._transitioning = true;
    this._host.classList.add("companion-phone-orientation-transitioning");
    this._pull.deactivate();

    if (active) {
      this._capturePortraitFlowBlockSize();
      this._active = true;
      this._host.classList.add(
        "companion-phone-landscape",
        "companion-phone-orientation-overlay",
      );
      this._orientationChanged(true);
      await this._host.updateComplete;
      if (!this._isCurrent(true, generation)) return;
    } else {
      if (!(await this._waitForStablePortraitViewport(generation))) return;

      // Render the portrait Stage while the old landscape surface still covers
      // Home Assistant. Removing both classes in this same microtask prevents a
      // portrait frame from ever occupying the full-viewport overlay.
      this._orientationChanged(false);
      await this._host.updateComplete;
      if (
        !this._connected ||
        this._target ||
        !this._active ||
        this._transitionGeneration !== generation
      )
        return;
      this._active = false;
      this._host.classList.remove(
        "companion-phone-landscape",
        "companion-phone-orientation-overlay",
      );
    }

    this._transitioning = false;
    this._host.classList.remove("companion-phone-orientation-transitioning");
    if (active) {
      this._pull.activate();
    }
  }

  private async _waitForStablePortraitViewport(
    generation: number,
  ): Promise<boolean> {
    if (window.innerWidth >= window.innerHeight) return true;
    let previous = "";
    let stableFrames = 0;
    while (this._connected && this._transitionGeneration === generation) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (this._target) return false;
      if (window.innerWidth >= window.innerHeight) return true;
      const current = `${window.innerWidth}x${window.innerHeight}`;
      stableFrames = current === previous ? stableFrames + 1 : 0;
      previous = current;
      if (stableFrames >= PORTRAIT_VIEWPORT_STABLE_FRAMES) return true;
    }
    return false;
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
