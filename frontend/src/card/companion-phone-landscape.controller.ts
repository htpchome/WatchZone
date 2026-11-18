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
const ORIENTATION_SETTLE_MS = 280;
const REQUIRED_STABLE_FRAMES = 3;

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
  private _connected = false;
  private _frame?: number;
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

  private async _sync(): Promise<void> {
    const active = this._targetActive();
    if (active === this._active) {
      if (active) this._pull.sync();
      return;
    }
    this._active = active;
    if (!active) this._pull.deactivate();
    this._host.classList.toggle("companion-phone-landscape", active);
    this._orientationChanged(active);
    await this._host.updateComplete;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    if (this._connected && this._active === active && active) {
      this._pull.activate();
    }
  }
}
