export type ClientApplication =
  "browser" | "home_assistant_catalyst" | "home_assistant_companion";
export type ClientDeviceClass = "desktop" | "phone" | "tablet";
export type ClientOperatingSystem = "android" | "desktop_other" | "ios";

interface NavigatorClientHints {
  readonly mobile?: boolean;
  readonly platform?: string;
}

interface ClientNavigator {
  readonly maxTouchPoints?: number;
  readonly platform?: string;
  readonly userAgent?: string;
  readonly userAgentData?: NavigatorClientHints;
  readonly vendor?: string;
}

interface MediaQueryListLike {
  readonly matches: boolean;
}

interface ClientWindow {
  matchMedia?(query: string): MediaQueryListLike;
}

export interface ClientProfileEnvironment {
  readonly navigator?: ClientNavigator;
  readonly window?: ClientWindow;
}

export interface ClientProfile {
  readonly application: ClientApplication;
  readonly deviceClass: ClientDeviceClass;
  readonly hasAnyTouch: boolean;
  readonly hasPrimaryTouch: boolean;
  readonly hasTouch: boolean;
  readonly isAndroid: boolean;
  readonly isCatalyst: boolean;
  readonly isCompanionApp: boolean;
  readonly isDesktop: boolean;
  readonly isIOS: boolean;
  readonly isMobile: boolean;
  readonly isPhone: boolean;
  readonly isTablet: boolean;
  readonly operatingSystem: ClientOperatingSystem;
}

function mediaMatches(windowObject: ClientWindow, query: string): boolean {
  return windowObject.matchMedia?.(query).matches === true;
}

/** Detects physical client and Home Assistant app context without layout size. */
export function detectClientProfile(
  environment: ClientProfileEnvironment = {},
): ClientProfile {
  const navigatorObject =
    environment.navigator ??
    ((typeof globalThis.navigator === "undefined"
      ? {}
      : globalThis.navigator) as ClientNavigator);
  const windowObject =
    environment.window ??
    ((typeof globalThis.window === "undefined"
      ? {}
      : globalThis.window) as ClientWindow);
  const userAgent = String(
    navigatorObject.userAgent ?? navigatorObject.vendor ?? "",
  ).toLowerCase();
  const platform = String(
    navigatorObject.userAgentData?.platform ?? navigatorObject.platform ?? "",
  ).toLowerCase();
  const maxTouchPoints = Number(navigatorObject.maxTouchPoints ?? 0);
  const hasPrimaryTouch = mediaMatches(windowObject, "(pointer: coarse)");
  const anyPointerCoarse = mediaMatches(windowObject, "(any-pointer: coarse)");
  const hoverNone = mediaMatches(windowObject, "(hover: none)");
  const hasAnyTouch = anyPointerCoarse || hoverNone;
  const hasTouch = maxTouchPoints > 0 || hasPrimaryTouch || hasAnyTouch;
  const isAndroid =
    platform.includes("android") || userAgent.includes("android");
  const isCompanionApp =
    /home assistant\//.test(userAgent) ||
    /homeassistant\/|mobile\/homeassistant/.test(userAgent);
  const isCatalyst =
    (platform.includes("mac") || userAgent.includes("macintosh")) &&
    /mobile\/homeassistant|home assistant\//.test(userAgent) &&
    maxTouchPoints === 0;
  const isIPhone = userAgent.includes("iphone");
  const isIPod = userAgent.includes("ipod");
  const isMobileHint =
    navigatorObject.userAgentData?.mobile === true ||
    /mobile|mobi/.test(userAgent);
  const isIPad =
    userAgent.includes("ipad") ||
    (platform.includes("mac") && maxTouchPoints > 1 && hasTouch);
  const isIOS = !isCatalyst && (isIPhone || isIPad || isIPod);
  const isTablet = isIPad || (isAndroid && hasTouch && !isMobileHint);
  const isPhone =
    !isCatalyst &&
    !isTablet &&
    (isIPhone ||
      isIPod ||
      (isAndroid && !isTablet) ||
      navigatorObject.userAgentData?.mobile === true);
  const isMobile = isPhone || isTablet;
  const deviceClass: ClientDeviceClass = isPhone
    ? "phone"
    : isTablet
      ? "tablet"
      : "desktop";
  const application: ClientApplication = isCatalyst
    ? "home_assistant_catalyst"
    : isCompanionApp
      ? "home_assistant_companion"
      : "browser";
  const operatingSystem: ClientOperatingSystem = isAndroid
    ? "android"
    : isIOS
      ? "ios"
      : "desktop_other";

  return {
    application,
    deviceClass,
    hasAnyTouch,
    hasPrimaryTouch,
    hasTouch,
    isAndroid,
    isCatalyst,
    isCompanionApp,
    isDesktop: !isMobile,
    isIOS,
    isMobile,
    isPhone,
    isTablet,
    operatingSystem,
  };
}

export const CLIENT_PROFILE = Object.freeze(detectClientProfile());
