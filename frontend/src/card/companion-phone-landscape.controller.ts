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

/** Owns Companion-phone orientation changes and the Stage reflow animation. */
class CompanionPhoneLandscapeController implements ReactiveController {
  private _active = false;
  private _connected = false;
  private _frame?: number;
  private readonly _pull: CompanionCameraPullController;
  private _syncTimer?: number;

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
    this._schedule();
  }

  public hostDisconnected(): void {
    this._connected = false;
    window.removeEventListener("resize", this._schedule);
    window.visualViewport?.removeEventListener("resize", this._schedule);
    this._pull.deactivate();
    if (this._syncTimer !== undefined) clearTimeout(this._syncTimer);
    this._syncTimer = undefined;
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = undefined;
  }

  private readonly _schedule = (): void => {
    if (!this._connected) return;
    if (this._syncTimer !== undefined) clearTimeout(this._syncTimer);
    this._syncTimer = window.setTimeout(() => {
      this._syncTimer = undefined;
      if (this._frame !== undefined) return;
      this._frame = requestAnimationFrame(() => {
        this._frame = undefined;
        void this._sync();
      });
    }, 120);
  };

  private async _sync(): Promise<void> {
    const active =
      window.innerWidth > window.innerHeight && this._canActivate();
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
    if (active) this._pull.activate();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    this._host.renderRoot
      .querySelector("ha-card")
      ?.animate([{ transform: "scale(.985)" }, { transform: "none" }], {
        duration: 240,
        easing: "cubic-bezier(.2,.8,.2,1)",
      });
  }
}
