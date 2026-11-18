import type { ReactiveController, ReactiveControllerHost } from "lit";

import { companionPhoneLandscapeStyles } from "./companion-phone-landscape.styles";

interface LandscapeHost extends ReactiveControllerHost, HTMLElement {
  readonly renderRoot: DocumentFragment | HTMLElement;
  readonly updateComplete: Promise<boolean>;
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
      void this._sync();
    });
  };

  private async _sync(): Promise<void> {
    const active =
      window.innerWidth > window.innerHeight && this._canActivate();
    if (active === this._active) return;
    const before = this._measure();
    this._active = active;
    this._host.classList.toggle("companion-phone-landscape", active);
    await this._host.updateComplete;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const element of this._placements()) {
      const first = before.get(element.dataset.layoutNode ?? "");
      if (!first) continue;
      const last = element.getBoundingClientRect();
      if (last.width <= 0 || last.height <= 0) continue;
      element.animate(
        [
          {
            opacity: 0.75,
            transform: `translate(${first.left - last.left}px,${first.top - last.top}px) scale(${first.width / last.width},${first.height / last.height})`,
            transformOrigin: "top left",
          },
          { opacity: 1, transform: "none", transformOrigin: "top left" },
        ],
        { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
    }
  }

  private _measure(): ReadonlyMap<string, DOMRect> {
    return new Map(
      this._placements().map((element) => [
        element.dataset.layoutNode ?? "",
        element.getBoundingClientRect(),
      ]),
    );
  }

  private _placements(): HTMLElement[] {
    return Array.from(
      this._host.renderRoot.querySelectorAll<HTMLElement>(
        ".stage-placement[data-layout-node]",
      ),
    );
  }
}
