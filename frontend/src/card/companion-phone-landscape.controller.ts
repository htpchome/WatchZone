import type { ReactiveController, ReactiveControllerHost } from "lit";

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
): void {
  if (installedHosts.has(host)) return;
  installedHosts.add(host);
  new CompanionPhoneLandscapeController(host, canActivate, orientationChanged);
}

/** Owns Companion-phone orientation changes and the Stage reflow animation. */
class CompanionPhoneLandscapeController implements ReactiveController {
  private _active: boolean;
  private _connected = false;
  private _frame?: number;
  private _settleTimer?: number;

  public constructor(
    private readonly _host: LandscapeHost,
    private readonly _canActivate: CanActivate,
    private readonly _orientationChanged: OrientationChanged,
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
    void this._sync();
  }

  public hostUpdated(): void {
    this.sync();
  }

  public hostDisconnected(): void {
    this._connected = false;
    window.removeEventListener("resize", this._schedule);
    window.visualViewport?.removeEventListener("resize", this._schedule);
    if (this._settleTimer !== undefined) clearTimeout(this._settleTimer);
    this._settleTimer = undefined;
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = undefined;
  }

  public sync(): void {
    this._schedule();
  }

  private readonly _schedule = (): void => {
    if (!this._connected) return;
    if (this._settleTimer !== undefined) clearTimeout(this._settleTimer);
    this._settleTimer = window.setTimeout(() => {
      this._settleTimer = undefined;
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
    if (active === this._active) return;
    this._active = active;
    this._host.classList.toggle("companion-phone-landscape", active);
    this._orientationChanged(active);
    await this._host.updateComplete;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    this._host.renderRoot
      .querySelector("ha-card")
      ?.animate([{ transform: "scale(.985)" }, { transform: "none" }], {
        duration: 240,
        easing: "cubic-bezier(.2,.8,.2,1)",
      });
  }
}
