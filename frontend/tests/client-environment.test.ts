import { describe, expect, it, vi } from "vitest";

import {
  type ClientEnvironmentSource,
  ClientEnvironment,
} from "../src/core/client-environment";

function runtime(
  navigator: NonNullable<ClientEnvironmentSource["navigator"]>,
  matches: readonly string[] = [],
): ClientEnvironment {
  return new ClientEnvironment({
    navigator,
    window: {
      matchMedia: (query) => ({ matches: matches.includes(query) }),
    },
  });
}

describe("ClientEnvironment", () => {
  it.each([
    {
      name: "Home Assistant macOS Catalyst",
      navigator: {
        platform: "MacIntel",
        userAgent:
          "Mozilla/5.0 (Macintosh) Mobile/15E148 Home Assistant/2026.11",
      },
      expected: {
        catalyst: true,
        companion: true,
        deviceClass: "desktop",
        host: "catalyst",
        operatingSystem: "macos",
      },
    },
    {
      name: "alternate Catalyst app signature",
      navigator: {
        platform: "macOS",
        userAgent: "Mobile/HomeAssistant",
      },
      expected: {
        catalyst: true,
        companion: true,
        deviceClass: "desktop",
        host: "catalyst",
        operatingSystem: "macos",
      },
    },
    {
      name: "iPadOS Companion with a desktop Safari identity",
      navigator: {
        maxTouchPoints: 5,
        platform: "MacIntel",
        userAgent:
          "Mozilla/5.0 (Macintosh) Mobile/15E148 Home Assistant/2026.11",
      },
      matches: ["(pointer: coarse)", "(hover: none)"],
      expected: {
        catalyst: false,
        companion: true,
        deviceClass: "tablet",
        host: "companion",
        operatingSystem: "ipados",
      },
    },
    {
      name: "iPhone Companion",
      navigator: {
        maxTouchPoints: 5,
        platform: "iPhone",
        userAgent: "iPhone Mobile/HomeAssistant",
      },
      expected: {
        catalyst: false,
        companion: true,
        deviceClass: "phone",
        host: "companion",
        operatingSystem: "ios",
      },
    },
    {
      name: "Android Companion phone",
      navigator: {
        maxTouchPoints: 5,
        platform: "Linux armv8l",
        userAgent: "Android 16 Mobile Home Assistant/2026.11",
      },
      expected: {
        catalyst: false,
        companion: true,
        deviceClass: "phone",
        host: "companion",
        operatingSystem: "android",
      },
    },
    {
      name: "Android Companion tablet",
      navigator: {
        maxTouchPoints: 5,
        platform: "Linux armv8l",
        userAgent: "Android 16 Home Assistant/2026.11",
      },
      expected: {
        catalyst: false,
        companion: true,
        deviceClass: "tablet",
        host: "companion",
        operatingSystem: "android",
      },
    },
    {
      name: "ordinary macOS Safari",
      navigator: {
        platform: "MacIntel",
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18 Safari/605.1.15",
      },
      expected: {
        catalyst: false,
        companion: false,
        deviceClass: "desktop",
        host: "browser",
        operatingSystem: "macos",
      },
    },
    {
      name: "touch-capable Windows PC",
      navigator: {
        maxTouchPoints: 10,
        platform: "Win32",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      matches: ["(any-pointer: coarse)"],
      expected: {
        catalyst: false,
        companion: false,
        deviceClass: "desktop",
        host: "browser",
        operatingSystem: "windows",
      },
    },
    {
      name: "ChromeOS desktop",
      navigator: {
        platform: "Linux x86_64",
        userAgent: "Mozilla/5.0 (X11; CrOS x86_64 16000.0.0)",
      },
      expected: {
        catalyst: false,
        companion: false,
        deviceClass: "desktop",
        host: "browser",
        operatingSystem: "chromeos",
      },
    },
  ] as const)("classifies $name", ({ navigator, matches = [], expected }) => {
    expect(runtime(navigator, matches)).toMatchObject(expected);
  });

  it("prefers structured UA client hints when Chromium supplies them", () => {
    expect(
      runtime({
        platform: "Linux armv8l",
        userAgent: "Mozilla/5.0",
        userAgentData: { mobile: true, platform: "Android" },
      }),
    ).toMatchObject({
      deviceClass: "phone",
      operatingSystem: "android",
    });
    expect(
      runtime({
        maxTouchPoints: 5,
        platform: "Linux armv8l",
        userAgent: "Mozilla/5.0",
        userAgentData: { mobile: false, platform: "Android" },
      }),
    ).toMatchObject({
      deviceClass: "tablet",
      operatingSystem: "android",
    });
  });

  it("combines touch APIs and media capabilities without changing device class", () => {
    expect(
      runtime(
        {
          maxTouchPoints: 0,
          platform: "Win32",
          userAgent: "Mozilla/5.0 (Windows NT 10.0)",
        },
        ["(pointer: coarse)", "(hover: none)"],
      ),
    ).toMatchObject({
      deviceClass: "desktop",
      hasTouch: true,
      primaryTouch: true,
    });
  });

  it("always rejects WebRTC for Catalyst even when the API is exposed", () => {
    vi.stubGlobal("RTCPeerConnection", class MisleadingPeerConnection {});
    try {
      expect(
        runtime({
          platform: "MacIntel",
          userAgent: "Macintosh Mobile/HomeAssistant",
        }).webRtcSupported,
      ).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
