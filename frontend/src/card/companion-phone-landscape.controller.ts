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
const FLIP_DURATION_MS = 400;
const FLIP_EASING = "cubic-bezier(.2,.8,.2,1)";
const ORIENTATION_SETTLE_MS = 128;
const PLACEMENT_SELECTOR = ".stage-placement[data-layout-node]";
const REQUIRED_STABLE_FRAMES = 4;
const SETTLEMENT_FRAMES = 2;

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

async function waitForAnimationFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  }
}

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

/** Owns Companion-phone orientation changes and the settled Stage reflow. */
class CompanionPhoneLandscapeController implements ReactiveController {
  private _active = false;
  private readonly _animations = new Set<Animation>();
  private _connected = false;
  private _frame?: number;
  private _initialized = false;
  private _lastViewport = viewportSnapshot();
  private _lastViewportChange = 0;
  private readonly _pull: CompanionCameraPullController;
  private _stableFrames = 0;

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
    window.addEventListener("resize", this._schedule);
    window.visualViewport?.addEventListener("resize", this._schedule);
    void this._sync();
  }

  public hostUpdated(): void {
    if (this._active) this._pull.sync();
    if (this._frame === undefined && this._targetActive() !== this._active) {
      this._schedule();
    }
  }

  public hostDisconnected(): void {
    this._connected = false;
    window.removeEventListener("resize", this._schedule);
    window.visualViewport?.removeEventListener("resize", this._schedule);
    this._pull.deactivate();
    this._cancelAnimations();
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = undefined;
  }

  private readonly _schedule = (): void => {
    if (!this._connected) return;
    this._lastViewport = viewportSnapshot();
    this._lastViewportChange = performance.now();
    this._stableFrames = 0;
    if (this._frame === undefined) {
      this._frame = requestAnimationFrame(this._settle);
    }
  };

  private readonly _settle = (now: number): void => {
    this._frame = undefined;
    if (!this._connected) return;
    const viewport = viewportSnapshot();
    if (sameViewport(viewport, this._lastViewport)) {
      this._stableFrames += 1;
    } else {
      this._lastViewport = viewport;
      this._lastViewportChange = now;
      this._stableFrames = 0;
    }
    if (
      this._stableFrames < REQUIRED_STABLE_FRAMES ||
      now - this._lastViewportChange < ORIENTATION_SETTLE_MS
    ) {
      this._frame = requestAnimationFrame(this._settle);
      return;
    }
    void this._sync();
  };

  private _targetActive(): boolean {
    return window.innerWidth > window.innerHeight && this._canActivate();
  }

  private _capturePlacements(): Map<HTMLElement, DOMRect> {
    const placements =
      this._host.renderRoot.querySelectorAll<HTMLElement>(PLACEMENT_SELECTOR);
    return new Map(
      Array.from(placements, (placement) => [
        placement,
        placement.getBoundingClientRect(),
      ]),
    );
  }

  private _cancelAnimations(): void {
    for (const animation of this._animations) animation.cancel();
    this._animations.clear();
  }

  private async _playFlip(before: Map<HTMLElement, DOMRect>): Promise<void> {
    const finished: Promise<void>[] = [];
    for (const [placement, first] of before) {
      if (!placement.isConnected) continue;
      const last = placement.getBoundingClientRect();
      if (
        first.width <= 0 ||
        first.height <= 0 ||
        last.width <= 0 ||
        last.height <= 0
      ) {
        continue;
      }
      const translateX = first.left - last.left;
      const translateY = first.top - last.top;
      const scaleX = first.width / last.width;
      const scaleY = first.height / last.height;
      if (
        Math.abs(translateX) < 0.5 &&
        Math.abs(translateY) < 0.5 &&
        Math.abs(scaleX - 1) < 0.005 &&
        Math.abs(scaleY - 1) < 0.005
      ) {
        continue;
      }
      const animation = placement.animate(
        [
          {
            transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
            transformOrigin: "0 0",
          },
          { transform: "none", transformOrigin: "0 0" },
        ],
        {
          duration: FLIP_DURATION_MS,
          easing: FLIP_EASING,
        },
      );
      this._animations.add(animation);
      finished.push(
        animation.finished.then(
          () => {
            this._animations.delete(animation);
          },
          () => {
            this._animations.delete(animation);
          },
        ),
      );
    }
    await Promise.all(finished);
  }

  private async _sync(): Promise<void> {
    const active = this._targetActive();
    const animate =
      this._initialized &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._initialized = true;
    if (active === this._active) {
      if (active) this._pull.sync();
      return;
    }
    const before = animate ? this._capturePlacements() : new Map();
    this._cancelAnimations();
    this._active = active;
    if (!active) this._pull.deactivate();
    this._host.classList.toggle("companion-phone-landscape", active);
    this._orientationChanged(active);
    await this._host.updateComplete;
    if (!this._connected || this._active !== active) return;
    if (animate) {
      await this._playFlip(before);
      await waitForAnimationFrames(SETTLEMENT_FRAMES);
    }
    if (this._connected && this._active === active && active) {
      this._pull.activate();
    }
  }
}
