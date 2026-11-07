import { describe, expect, it } from "vitest";

import { detectClientProfile } from "../src/core/client-profile";

function matchMedia(matches: readonly string[] = []) {
  return (query: string) => ({ matches: matches.includes(query) });
}

describe("client profile", () => {
  it("detects an iPhone Companion client independently of width", () => {
    expect(
      detectClientProfile({
        navigator: {
          maxTouchPoints: 5,
          platform: "iPhone",
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Home Assistant/2026.9 Mobile/HomeAssistant, like Safari",
        },
        window: {
          matchMedia: matchMedia([
            "(pointer: coarse)",
            "(any-pointer: coarse)",
            "(hover: none)",
          ]),
        },
      }),
    ).toMatchObject({
      application: "home_assistant_companion",
      deviceClass: "phone",
      isCompanionApp: true,
      isIOS: true,
      isPhone: true,
      operatingSystem: "ios",
    });
  });

  it("detects Android phones from Client Hints", () => {
    expect(
      detectClientProfile({
        navigator: {
          maxTouchPoints: 5,
          userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/126 Mobile",
          userAgentData: { mobile: true, platform: "Android" },
        },
        window: {
          matchMedia: matchMedia(["(pointer: coarse)"]),
        },
      }),
    ).toMatchObject({
      application: "browser",
      deviceClass: "phone",
      isAndroid: true,
      isPhone: true,
      operatingSystem: "android",
    });
  });

  it("distinguishes Android tablets from phones", () => {
    expect(
      detectClientProfile({
        navigator: {
          maxTouchPoints: 5,
          userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/126 Safari/537.36",
          userAgentData: { mobile: false, platform: "Android" },
        },
        window: {
          matchMedia: matchMedia(["(pointer: coarse)"]),
        },
      }),
    ).toMatchObject({
      deviceClass: "tablet",
      isPhone: false,
      isTablet: true,
    });
  });

  it("detects the iPadOS Mac platform spoof as a tablet", () => {
    expect(
      detectClientProfile({
        navigator: {
          maxTouchPoints: 5,
          platform: "MacIntel",
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) Version/18.0 Mobile/15E148 Safari/604.1",
        },
        window: {
          matchMedia: matchMedia([
            "(pointer: coarse)",
            "(any-pointer: coarse)",
          ]),
        },
      }),
    ).toMatchObject({
      deviceClass: "tablet",
      isIOS: true,
      isPhone: false,
      isTablet: true,
      operatingSystem: "ios",
    });
  });

  it("keeps a touch-capable Windows client classified as desktop", () => {
    expect(
      detectClientProfile({
        navigator: {
          maxTouchPoints: 10,
          platform: "Win32",
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36",
        },
        window: {
          matchMedia: matchMedia(["(any-pointer: coarse)"]),
        },
      }),
    ).toMatchObject({
      application: "browser",
      deviceClass: "desktop",
      hasTouch: true,
      isDesktop: true,
      isMobile: false,
    });
  });

  it("detects the Home Assistant Mac Catalyst app as desktop", () => {
    expect(
      detectClientProfile({
        navigator: {
          maxTouchPoints: 0,
          platform: "MacIntel",
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7) Version/18.6 Safari/605.1.15 Home Assistant/2026.9 (io.robbie.HomeAssistant; macOS 15.7.0) Mobile/HomeAssistant, like Safari",
        },
        window: { matchMedia: matchMedia() },
      }),
    ).toMatchObject({
      application: "home_assistant_catalyst",
      deviceClass: "desktop",
      isCatalyst: true,
      isCompanionApp: true,
      isDesktop: true,
      isIOS: false,
      isMobile: false,
    });
  });

  it("uses a conservative desktop fallback without browser globals", () => {
    expect(detectClientProfile({ navigator: {}, window: {} })).toMatchObject({
      application: "browser",
      deviceClass: "desktop",
      isDesktop: true,
      isMobile: false,
    });
  });
});
