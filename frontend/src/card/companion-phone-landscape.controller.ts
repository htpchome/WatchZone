import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { LocalizeFunction } from "../core/localization";
import {
  animateElement,
  type MotionAnimation,
  motionDurations,
  motionEasings,
  reducedMotionRequested,
} from "../ui/motion";
import { CompanionCameraPullController } from "./companion-camera-pull.controller";
import { companionPhoneLandscapeStyles } from "./companion-phone-landscape.styles";

interface LandscapeHost extends ReactiveControllerHost, HTMLElement {
  readonly renderRoot: DocumentFragment | HTMLElement;
  readonly updateComplete: Promise<boolean>;
}

type CanActivate = () => boolean;
type OrientationChanged = (active: boolean) => void;

const installedHosts = new WeakSet<LandscapeHost>();
const OUTER_LAYOUT_SETTLE_MS = 64;
const REQUIRED_STABLE_FRAMES = 2;
const SURFACE_SELECTORS = {
  activity: '.stage-placement[data-layout-node$="default-activity-stack"]',
  camera: '.stage-placement[data-layout-node$="default-camera-module"]',
} as const;
const AUXILIARY_SELECTORS = [
  '.stage-placement[data-layout-node$="default-camera-navigation-module"]',
  '.stage-placement[data-layout-node$="default-activity-navigation-module"]',
] as const;

type SurfaceName = keyof typeof SURFACE_SELECTORS;

interface ViewportSnapshot {
  readonly height: number;
  readonly layoutTop: number;
  readonly visualHeight: number;
  readonly visualWidth: number;
  readonly width: number;
}

interface RectSnapshot {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

interface TransitionSnapshot {
  readonly angle?: number;
  readonly surfaces: Partial<Record<SurfaceName, RectSnapshot>>;
  readonly viewport: ViewportSnapshot;
}

function composedParentElement(element: Element): Element | undefined {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : undefined;
}

function viewportSnapshot(host: HTMLElement): ViewportSnapshot {
  return {
    height: window.innerHeight,
    layoutTop:
      composedParentElement(host)?.getBoundingClientRect().top ??
      host.getBoundingClientRect().top,
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
    Math.abs(first.layoutTop - second.layoutTop) < 0.5 &&
    first.visualHeight === second.visualHeight &&
    first.visualWidth === second.visualWidth &&
    first.width === second.width
  );
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function orientationAngle(): number | undefined {
  const screenAngle = globalThis.screen?.orientation?.angle;
  if (typeof screenAngle === "number") return screenAngle;
  const legacyAngle = (window as Window & { orientation?: number }).orientation;
  return typeof legacyAngle === "number" ? legacyAngle : undefined;
}

function shortestAngle(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function mapRotatedRect(
  rect: RectSnapshot,
  from: ViewportSnapshot,
  to: ViewportSnapshot,
  rotation: number,
): RectSnapshot {
  if (Math.abs(rotation) !== 90 || from.width <= 0 || from.height <= 0) {
    return rect;
  }
  const inlineScale = to.width / from.height;
  const blockScale = to.height / from.width;
  if (rotation > 0) {
    return {
      height: rect.width * blockScale,
      left: (from.height - rect.top - rect.height) * inlineScale,
      top: rect.left * blockScale,
      width: rect.height * inlineScale,
    };
  }
  return {
    height: rect.width * blockScale,
    left: rect.top * inlineScale,
    top: (from.width - rect.left - rect.width) * blockScale,
    width: rect.height * inlineScale,
  };
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
  private readonly _animations = new Set<MotionAnimation>();
  private _connected = false;
  private _frame?: number;
  private _initialized = false;
  private _lastViewport = viewportSnapshot(this._host);
  private _lastViewportChange = 0;
  private readonly _pull: CompanionCameraPullController;
  private _settledSnapshot?: TransitionSnapshot;
  private _stableFrames = 0;
  private _transitionGeneration = 0;

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
    void this._sync();
  }

  public hostUpdated(): void {
    if (this._animations.size === 0 && this._targetActive() === this._active) {
      this._settledSnapshot = this._captureSnapshot();
      if (this._active) this._pull.sync();
    }
    if (this._frame === undefined && this._targetActive() !== this._active) {
      this._schedule();
    }
  }

  public hostDisconnected(): void {
    this._connected = false;
    this._transitionGeneration += 1;
    window.removeEventListener("orientationchange", this._schedule);
    window.removeEventListener("resize", this._schedule);
    window.visualViewport?.removeEventListener("resize", this._schedule);
    this._pull.deactivate();
    this._cancelAnimations();
    this._host.classList.remove("companion-phone-orientation-transitioning");
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = undefined;
  }

  private readonly _schedule = (): void => {
    if (!this._connected) return;
    this._lastViewport = viewportSnapshot(this._host);
    this._lastViewportChange = performance.now();
    this._stableFrames = 0;
    // Claim either destination on the first aspect-ratio change. Waiting for
    // viewport settlement here lets the ordinary phone Stage paint at the
    // wide width first, producing the full-width camera flash seen on device.
    if (this._initialized && this._targetActive() !== this._active) {
      if (this._frame !== undefined) cancelAnimationFrame(this._frame);
      this._frame = undefined;
      void this._sync();
      return;
    }
    if (this._frame === undefined) {
      this._frame = requestAnimationFrame(this._settle);
    }
  };

  private readonly _settle = (now: number): void => {
    this._frame = undefined;
    if (!this._connected) return;
    const viewport = viewportSnapshot(this._host);
    if (sameViewport(viewport, this._lastViewport)) {
      this._stableFrames += 1;
    } else {
      this._lastViewport = viewport;
      this._lastViewportChange = now;
      this._stableFrames = 0;
    }
    if (
      this._stableFrames < REQUIRED_STABLE_FRAMES ||
      now - this._lastViewportChange < OUTER_LAYOUT_SETTLE_MS
    ) {
      this._frame = requestAnimationFrame(this._settle);
      return;
    }
    void this._sync();
  };

  private _targetActive(): boolean {
    return window.innerWidth > window.innerHeight && this._canActivate();
  }

  private _captureSnapshot(): TransitionSnapshot {
    const surfaces: Partial<Record<SurfaceName, RectSnapshot>> = {};
    for (const [name, selector] of Object.entries(SURFACE_SELECTORS) as Array<
      [SurfaceName, string]
    >) {
      const rect = this._host.renderRoot
        .querySelector<HTMLElement>(selector)
        ?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        surfaces[name] = {
          height: rect.height,
          left: rect.left,
          top: rect.top,
          width: rect.width,
        };
      }
    }
    return {
      angle: orientationAngle(),
      surfaces,
      viewport: viewportSnapshot(this._host),
    };
  }

  private _cancelAnimations(): void {
    for (const animation of this._animations) animation.cancel();
    this._animations.clear();
    for (const selector of [
      ...Object.values(SURFACE_SELECTORS),
      ...AUXILIARY_SELECTORS,
    ]) {
      const element =
        this._host.renderRoot.querySelector<HTMLElement>(selector);
      element?.style.removeProperty("opacity");
      element?.style.removeProperty("transform");
      element?.style.removeProperty("transform-origin");
    }
  }

  private async _playTransition(
    before: TransitionSnapshot,
    active: boolean,
  ): Promise<void> {
    if (reducedMotionRequested()) return;
    const after = this._captureSnapshot();
    const measuredRotation =
      before.angle === undefined || after.angle === undefined
        ? 0
        : shortestAngle(before.angle, after.angle);
    const rotation =
      Math.abs(measuredRotation) === 90 ? measuredRotation : active ? 90 : -90;
    const animations: MotionAnimation[] = [];

    for (const [name, selector] of Object.entries(SURFACE_SELECTORS) as Array<
      [SurfaceName, string]
    >) {
      const element =
        this._host.renderRoot.querySelector<HTMLElement>(selector);
      const first = before.surfaces[name];
      const last = after.surfaces[name];
      if (!element || !first || !last || last.width <= 0 || last.height <= 0)
        continue;
      const mapped = mapRotatedRect(
        first,
        before.viewport,
        after.viewport,
        rotation,
      );
      const translateX = mapped.left - last.left;
      const translateY = mapped.top - last.top;
      const scaleX = mapped.width / last.width;
      const scaleY = mapped.height / last.height;
      if (![translateX, translateY, scaleX, scaleY].every(Number.isFinite))
        continue;
      animations.push(
        animateElement(
          element,
          {
            transform: [
              `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
              "none",
            ],
            transformOrigin: "0 0",
          },
          {
            duration: motionDurations.layout,
            ease: motionEasings.standard,
          },
        ),
      );
    }

    for (const selector of AUXILIARY_SELECTORS) {
      const element =
        this._host.renderRoot.querySelector<HTMLElement>(selector);
      if (!element) continue;
      animations.push(
        animateElement(
          element,
          { opacity: [0, 1] },
          {
            duration: motionDurations.layout,
            ease: motionEasings.standard,
          },
        ),
      );
    }

    for (const animation of animations) this._animations.add(animation);
    await Promise.all(
      animations.map((animation) =>
        animation.then(
          () => undefined,
          () => undefined,
        ),
      ),
    );
    for (const animation of animations) {
      if (!this._animations.delete(animation)) continue;
      animation.cancel();
    }
  }

  private async _sync(): Promise<void> {
    const active = this._targetActive();
    const animate = this._initialized && !reducedMotionRequested();
    this._initialized = true;
    if (active === this._active) {
      if (this._animations.size === 0) {
        this._settledSnapshot = this._captureSnapshot();
        if (active) this._pull.sync();
      }
      return;
    }
    const generation = ++this._transitionGeneration;
    const before = this._animations.size
      ? this._captureSnapshot()
      : (this._settledSnapshot ?? this._captureSnapshot());
    this._pull.deactivate();
    this._cancelAnimations();
    if (animate) {
      this._host.classList.add("companion-phone-orientation-transitioning");
    }
    this._active = active;
    this._host.classList.toggle("companion-phone-landscape", active);
    this._orientationChanged(active);
    await this._host.updateComplete;
    await nextFrame();
    if (!this._isCurrent(active, generation)) return;
    if (animate) await this._playTransition(before, active);
    if (!this._isCurrent(active, generation)) return;
    this._host.classList.remove("companion-phone-orientation-transitioning");
    this._settledSnapshot = this._captureSnapshot();
    if (this._connected && this._active === active && active) {
      await nextFrame();
      if (!this._isCurrent(active, generation)) return;
      this._pull.activate();
    }
  }

  private _isCurrent(active: boolean, generation: number): boolean {
    return (
      this._connected &&
      this._active === active &&
      this._transitionGeneration === generation
    );
  }
}
