export type DeviceClass = "desktop" | "phone" | "tablet";
export type InputMode = "hybrid" | "pointer" | "touch";

export interface DeviceProfile {
  readonly deviceClass: DeviceClass;
  readonly inputMode: InputMode;
  readonly isAndroid: boolean;
  readonly isIOS: boolean;
}

interface NavigatorHints {
  readonly maxTouchPoints?: number;
  readonly platform?: string;
  readonly userAgent?: string;
  readonly userAgentData?: {
    readonly mobile?: boolean;
    readonly platform?: string;
  };
}

interface WindowHints {
  matchMedia?(query: string): { readonly matches: boolean };
}

export interface DeviceProfileEnvironment {
  readonly navigator?: NavigatorHints;
  readonly window?: WindowHints;
}

export function detectDeviceProfile(
  environment: DeviceProfileEnvironment = {
    navigator: globalThis.navigator,
    window: globalThis.window,
  },
): DeviceProfile {
  const navigatorObject = environment.navigator ?? {};
  const windowObject = environment.window ?? {};
  const userAgent = (navigatorObject.userAgent ?? "").toLowerCase();
  const platform = (
    navigatorObject.userAgentData?.platform ??
    navigatorObject.platform ??
    ""
  ).toLowerCase();
  const touchPoints = Number(navigatorObject.maxTouchPoints ?? 0);
  const coarsePrimary = Boolean(
    windowObject.matchMedia?.("(pointer: coarse)").matches,
  );
  const coarseAvailable = Boolean(
    windowObject.matchMedia?.("(any-pointer: coarse)").matches,
  );
  const fineAvailable = Boolean(
    windowObject.matchMedia?.("(any-pointer: fine)").matches,
  );
  const hasTouch = touchPoints > 0 || coarsePrimary || coarseAvailable;

  const isAndroid = platform.includes("android") || /android/.test(userAgent);
  const isIPad =
    /ipad/.test(userAgent) ||
    (platform.includes("mac") && touchPoints > 1 && hasTouch);
  const isIPhone = /iphone|ipod/.test(userAgent);
  const isIOS = isIPad || isIPhone;
  const mobileHint =
    navigatorObject.userAgentData?.mobile === true ||
    /mobile|mobi/.test(userAgent);
  const tabletHint = /tablet|playbook|silk/.test(userAgent);

  const deviceClass: DeviceClass =
    isIPad || tabletHint || (isAndroid && hasTouch && !mobileHint)
      ? "tablet"
      : isIPhone || (isAndroid && mobileHint)
        ? "phone"
        : "desktop";
  const inputMode: InputMode =
    hasTouch && fineAvailable ? "hybrid" : hasTouch ? "touch" : "pointer";

  return { deviceClass, inputMode, isAndroid, isIOS };
}
