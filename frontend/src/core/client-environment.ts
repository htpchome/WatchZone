export type ClientDeviceClass = "desktop" | "phone" | "tablet";
export type ClientHost = "browser" | "catalyst" | "companion";
export type ClientOperatingSystem =
  | "android"
  | "chromeos"
  | "ios"
  | "ipados"
  | "linux"
  | "macos"
  | "unknown"
  | "windows";

interface NavigatorUserAgentData {
  readonly mobile?: boolean;
  readonly platform?: string;
}

interface ClientNavigator {
  readonly maxTouchPoints?: number;
  readonly platform?: string;
  readonly userAgent?: string;
  readonly userAgentData?: NavigatorUserAgentData;
}

interface MediaQueryListLike {
  readonly matches: boolean;
}

interface ClientWindow {
  matchMedia?(query: string): MediaQueryListLike;
}

export interface ClientEnvironmentSource {
  readonly navigator?: ClientNavigator;
  readonly window?: ClientWindow;
}

function includesAny(value: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}

function mediaMatches(windowObject: ClientWindow, query: string): boolean {
  return windowObject.matchMedia?.(query).matches === true;
}

/**
 * A document-scoped description of the physical client and Home Assistant host.
 *
 * This deliberately does not include viewport or component dimensions. Those
 * describe presentation space, not the device running the client.
 */
export class ClientEnvironment {
  public readonly catalyst: boolean;
  public readonly companion: boolean;
  public readonly deviceClass: ClientDeviceClass;
  public readonly hasTouch: boolean;
  public readonly host: ClientHost;
  public readonly operatingSystem: ClientOperatingSystem;
  public readonly primaryTouch: boolean;

  public constructor(environment: ClientEnvironmentSource = {}) {
    const navigatorObject: ClientNavigator =
      environment.navigator ??
      (globalThis.navigator as ClientNavigator | undefined) ??
      {};
    const windowObject: ClientWindow =
      environment.window ?? globalThis.window ?? {};
    const userAgent = String(navigatorObject.userAgent ?? "").toLowerCase();
    const platform = String(
      navigatorObject.userAgentData?.platform ?? navigatorObject.platform ?? "",
    ).toLowerCase();
    const maxTouchPoints = Math.max(
      0,
      Number(navigatorObject.maxTouchPoints ?? 0),
    );
    const primaryCoarse = mediaMatches(windowObject, "(pointer: coarse)");
    const anyCoarse = mediaMatches(windowObject, "(any-pointer: coarse)");
    const hoverNone = mediaMatches(windowObject, "(hover: none)");
    this.primaryTouch = primaryCoarse;
    this.hasTouch =
      maxTouchPoints > 0 || primaryCoarse || anyCoarse || hoverNone;

    const android =
      platform.includes("android") || userAgent.includes("android");
    const explicitIphone = includesAny(`${platform} ${userAgent}`, [
      "iphone",
      "ipod",
    ]);
    const explicitIpad = includesAny(`${platform} ${userAgent}`, ["ipad"]);
    const masqueradingIpad =
      platform.includes("mac") && maxTouchPoints > 1 && this.hasTouch;
    const ipad = explicitIpad || masqueradingIpad;
    const appleMobile = explicitIphone || ipad;
    const appleDesktop =
      !appleMobile &&
      (platform.includes("mac") || userAgent.includes("macintosh"));
    const homeAssistantApp =
      /home assistant\//.test(userAgent) ||
      /homeassistant\/|mobile\/homeassistant/.test(userAgent);

    // Catalyst is identified by the same HA-on-Mac signature used by the
    // established FrigateView path, with iPadOS desktop-UA exclusion added.
    this.catalyst = homeAssistantApp && appleDesktop;
    this.companion = homeAssistantApp;
    this.host = this.catalyst
      ? "catalyst"
      : homeAssistantApp
        ? "companion"
        : "browser";

    this.operatingSystem = android
      ? "android"
      : ipad
        ? "ipados"
        : explicitIphone
          ? "ios"
          : appleDesktop
            ? "macos"
            : platform.includes("win") || userAgent.includes("windows")
              ? "windows"
              : platform.includes("cros") || userAgent.includes("cros")
                ? "chromeos"
                : platform.includes("linux") || userAgent.includes("linux")
                  ? "linux"
                  : "unknown";

    const mobileHint =
      navigatorObject.userAgentData?.mobile === true ||
      /mobile|mobi/.test(userAgent);
    this.deviceClass =
      ipad || (android && this.hasTouch && !mobileHint)
        ? "tablet"
        : explicitIphone || (android && mobileHint)
          ? "phone"
          : "desktop";
  }

  public get isDesktop(): boolean {
    return this.deviceClass === "desktop";
  }

  public get isMobile(): boolean {
    return this.deviceClass !== "desktop";
  }

  public get isPhone(): boolean {
    return this.deviceClass === "phone";
  }

  public get isTablet(): boolean {
    return this.deviceClass === "tablet";
  }

  public get webRtcSupported(): boolean {
    // Catalyst exposes browser surfaces that do not represent a usable HA
    // WebRTC transport. Never probe it by constructing a peer connection.
    return !this.catalyst && typeof globalThis.RTCPeerConnection === "function";
  }
}

let clientEnvironment: ClientEnvironment | undefined;

export function getClientEnvironment(): ClientEnvironment {
  return (clientEnvironment ??= new ClientEnvironment());
}
