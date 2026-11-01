import type { ReactiveController, ReactiveControllerHost } from "lit";

export type DeviceClass = "desktop" | "phone" | "tablet";
export type DeviceSizeClass =
  | "compact_phone"
  | "phone"
  | "compact_tablet"
  | "tablet"
  | "desktop"
  | "wide_desktop";
export type InputMode = "hybrid" | "none" | "pointer" | "touch";
export type Orientation = "landscape" | "portrait" | "square";
export type PointerAccuracy = "coarse" | "fine" | "none";

export interface DeviceProfile {
  readonly anyHover: boolean;
  readonly blockSize: number;
  readonly deviceClass: DeviceClass;
  readonly deviceSizeClass: DeviceSizeClass;
  readonly hasTouch: boolean;
  readonly inlineSize: number;
  readonly inputMode: InputMode;
  readonly orientation: Orientation;
  readonly primaryHover: boolean;
  readonly primaryPointer: PointerAccuracy;
}

interface NavigatorCapabilities {
  readonly maxTouchPoints?: number;
}

interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener?(type: "change", listener: () => void): void;
  addListener?(listener: () => void): void;
  removeEventListener?(type: "change", listener: () => void): void;
  removeListener?(listener: () => void): void;
}

interface WindowCapabilities {
  readonly innerHeight?: number;
  readonly innerWidth?: number;
  matchMedia?(query: string): MediaQueryListLike;
}

export interface DeviceProfileEnvironment {
  readonly blockSize?: number;
  readonly inlineSize?: number;
  readonly navigator?: NavigatorCapabilities;
  readonly window?: WindowCapabilities;
}

export const DEVICE_SIZE_BREAKPOINTS = Object.freeze({
  compactPhone: 360,
  phone: 600,
  compactTablet: 768,
  tablet: 1024,
  wideDesktop: 1440,
});

const CAPABILITY_QUERIES = [
  "(pointer: coarse)",
  "(pointer: fine)",
  "(hover: hover)",
  "(any-pointer: coarse)",
  "(any-pointer: fine)",
  "(any-hover: hover)",
] as const;

type CapabilityQuery = (typeof CAPABILITY_QUERIES)[number];

function matches(
  windowObject: WindowCapabilities,
  query: CapabilityQuery,
): boolean {
  return windowObject.matchMedia?.(query).matches === true;
}

class InputCapabilityMonitor {
  private readonly _listeners = new Set<() => void>();
  private readonly _queries = new Map<CapabilityQuery, MediaQueryListLike>();

  public constructor(windowObject: WindowCapabilities) {
    for (const query of CAPABILITY_QUERIES) {
      this._queries.set(
        query,
        windowObject.matchMedia?.(query) ?? { matches: false },
      );
    }
  }

  public readonly windowCapabilities: WindowCapabilities = {
    matchMedia: (query) =>
      this._queries.get(query as CapabilityQuery) ?? { matches: false },
  };

  public subscribe(listener: () => void): () => void {
    if (this._listeners.size === 0) this._start();
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
      if (this._listeners.size === 0) this._stop();
    };
  }

  private readonly _publish = (): void => {
    for (const listener of this._listeners) listener();
  };

  private _start(): void {
    for (const query of this._queries.values()) {
      if (query.addEventListener) {
        query.addEventListener("change", this._publish);
      } else {
        query.addListener?.(this._publish);
      }
    }
  }

  private _stop(): void {
    for (const query of this._queries.values()) {
      if (query.removeEventListener) {
        query.removeEventListener("change", this._publish);
      } else {
        query.removeListener?.(this._publish);
      }
    }
  }
}

let inputCapabilityMonitor: InputCapabilityMonitor | undefined;

function getInputCapabilityMonitor(): InputCapabilityMonitor {
  return (inputCapabilityMonitor ??= new InputCapabilityMonitor(
    globalThis.window,
  ));
}

function classifySize(inlineSize: number): DeviceSizeClass {
  if (inlineSize < DEVICE_SIZE_BREAKPOINTS.compactPhone) {
    return "compact_phone";
  }
  if (inlineSize < DEVICE_SIZE_BREAKPOINTS.phone) return "phone";
  if (inlineSize < DEVICE_SIZE_BREAKPOINTS.compactTablet) {
    return "compact_tablet";
  }
  if (inlineSize < DEVICE_SIZE_BREAKPOINTS.tablet) return "tablet";
  if (inlineSize < DEVICE_SIZE_BREAKPOINTS.wideDesktop) return "desktop";
  return "wide_desktop";
}

function deviceClassForSize(sizeClass: DeviceSizeClass): DeviceClass {
  if (sizeClass === "compact_phone" || sizeClass === "phone") return "phone";
  if (sizeClass === "compact_tablet" || sizeClass === "tablet") {
    return "tablet";
  }
  return "desktop";
}

export function detectDeviceProfile(
  environment: DeviceProfileEnvironment = {},
): DeviceProfile {
  const navigatorObject = environment.navigator ?? globalThis.navigator ?? {};
  const windowObject = environment.window ?? globalThis.window ?? {};
  const inlineSize = Math.max(
    0,
    environment.inlineSize ?? windowObject.innerWidth ?? 0,
  );
  const blockSize = Math.max(
    0,
    environment.blockSize ?? windowObject.innerHeight ?? 0,
  );
  const primaryCoarse = matches(windowObject, "(pointer: coarse)");
  const primaryFine = matches(windowObject, "(pointer: fine)");
  const anyCoarse = matches(windowObject, "(any-pointer: coarse)");
  const anyFine = matches(windowObject, "(any-pointer: fine)");
  const hasTouch =
    Number(navigatorObject.maxTouchPoints ?? 0) > 0 ||
    primaryCoarse ||
    anyCoarse;
  const hasFinePointer = primaryFine || anyFine;
  const deviceSizeClass = classifySize(inlineSize);

  return {
    anyHover: matches(windowObject, "(any-hover: hover)"),
    blockSize,
    deviceClass: deviceClassForSize(deviceSizeClass),
    deviceSizeClass,
    hasTouch,
    inlineSize,
    inputMode:
      hasTouch && hasFinePointer
        ? "hybrid"
        : hasTouch
          ? "touch"
          : hasFinePointer
            ? "pointer"
            : "none",
    orientation:
      inlineSize === blockSize
        ? "square"
        : inlineSize > blockSize
          ? "landscape"
          : "portrait",
    primaryHover: matches(windowObject, "(hover: hover)"),
    primaryPointer: primaryCoarse ? "coarse" : primaryFine ? "fine" : "none",
  };
}

type ProfileHost = HTMLElement & ReactiveControllerHost;

/**
 * Keeps behavioral profile data aligned with the component's real container.
 * CSS remains responsible for purely visual responsive rules.
 */
export class DeviceProfileController implements ReactiveController {
  private _blockSize: number;
  private readonly _capabilityMonitor = getInputCapabilityMonitor();
  private _inlineSize: number;
  private _profile: DeviceProfile;
  private _resizeObserver?: ResizeObserver;
  private _unsubscribeCapabilities?: () => void;

  public constructor(private readonly _host: ProfileHost) {
    this._profile = detectDeviceProfile({
      window: {
        ...this._capabilityMonitor.windowCapabilities,
        innerHeight: globalThis.window.innerHeight,
        innerWidth: globalThis.window.innerWidth,
      },
    });
    this._inlineSize = this._profile.inlineSize;
    this._blockSize = this._profile.blockSize;
    _host.addController(this);
  }

  public get profile(): DeviceProfile {
    return this._profile;
  }

  public hostConnected(): void {
    this._unsubscribeCapabilities = this._capabilityMonitor.subscribe(
      this._handleCapabilityChange,
    );
    this._measureHost();
    if ("ResizeObserver" in globalThis) {
      this._resizeObserver = new ResizeObserver(([entry]) => {
        if (!entry) return;
        this._update(entry.contentRect.width, entry.contentRect.height);
      });
      this._resizeObserver.observe(this._host);
    } else {
      globalThis.window.addEventListener("resize", this._measureHost);
    }
  }

  public hostDisconnected(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    globalThis.window.removeEventListener("resize", this._measureHost);
    this._unsubscribeCapabilities?.();
    this._unsubscribeCapabilities = undefined;
  }

  private readonly _handleCapabilityChange = (): void => {
    this._update(this._inlineSize, this._blockSize);
  };

  private readonly _measureHost = (): void => {
    const bounds = this._host.getBoundingClientRect();
    this._update(bounds.width, bounds.height);
  };

  private _update(inlineSize: number, blockSize: number): void {
    if (inlineSize <= 0 || blockSize <= 0) return;
    this._inlineSize = inlineSize;
    this._blockSize = blockSize;
    const next = detectDeviceProfile({
      blockSize,
      inlineSize,
      window: this._capabilityMonitor.windowCapabilities,
    });
    const behaviorUnchanged =
      next.deviceSizeClass === this._profile.deviceSizeClass &&
      next.inputMode === this._profile.inputMode &&
      next.orientation === this._profile.orientation &&
      next.primaryPointer === this._profile.primaryPointer &&
      next.primaryHover === this._profile.primaryHover &&
      next.anyHover === this._profile.anyHover &&
      next.hasTouch === this._profile.hasTouch;
    this._profile = next;
    if (behaviorUnchanged) return;
    this._host.requestUpdate();
  }
}
