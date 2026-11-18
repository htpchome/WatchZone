import type { ReactiveController, ReactiveControllerHost } from "lit";

import { companionPhoneLandscapeStyles } from "./companion-phone-landscape.styles";

interface LandscapeHost extends ReactiveControllerHost, HTMLElement {
  readonly renderRoot: DocumentFragment | HTMLElement;
}

type CanActivate = () => boolean;

const installedHosts = new WeakSet<LandscapeHost>();

export function installCompanionPhoneLandscape(
  host: LandscapeHost,
  canActivate: CanActivate,
): void {
  if (installedHosts.has(host)) return;
  installedHosts.add(host);
  new CompanionPhoneLandscapeController(host, canActivate);
}

/** Owns Companion-phone orientation changes and the Stage reflow animation. */
class CompanionPhoneLandscapeController implements ReactiveController {
  private _active: boolean;
  private _connected = false;
  private _frame?: number;

  public constructor(
    private readonly _host: LandscapeHost,
    private readonly _canActivate: CanActivate,
  ) {
    this._active = false;
    _host.addController(this);
  }

  public get active(): boolean {
    return this._active;
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
    this.sync();
  }

  public hostUpdated(): void {
    this.sync();
  }

  public hostDisconnected(): void {
    this._connected = false;
    window.removeEventListener("resize", this._schedule);
    window.visualViewport?.removeEventListener("resize", this._schedule);
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = undefined;
  }

  public sync(): void {
    this._schedule();
  }

  private readonly _schedule = (): void => {
    if (!this._connected || this._frame !== undefined) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = undefined;
      this._sync();
    });
  };

  private _sync(): void {
    const active =
      window.innerWidth > window.innerHeight && this._canActivate();
    if (active === this._active) return;
    this._active = active;
    this._host.classList.toggle("companion-phone-landscape", active);
  }
}
