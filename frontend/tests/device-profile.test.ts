import { describe, expect, it } from "vitest";

import { detectDeviceProfile } from "../src/core/device-profile";

const matchMedia =
  (coarse: boolean, fine = !coarse) =>
  (query: string) => ({
    matches: query.includes("coarse") ? coarse : query.includes("fine") && fine,
  });

describe("device profile", () => {
  it("recognizes iPadOS when Safari reports a Mac platform", () => {
    expect(
      detectDeviceProfile({
        navigator: {
          maxTouchPoints: 5,
          platform: "MacIntel",
          userAgent: "Mozilla/5.0 Version/18 Safari/605.1.15",
        },
        window: { matchMedia: matchMedia(true) },
      }),
    ).toMatchObject({ deviceClass: "tablet", inputMode: "touch", isIOS: true });
  });

  it("distinguishes Android phones and tablets", () => {
    const phone = detectDeviceProfile({
      navigator: {
        maxTouchPoints: 5,
        platform: "Android",
        userAgent: "Mozilla/5.0 (Linux; Android 16) Mobile",
      },
      window: { matchMedia: matchMedia(true) },
    });
    const tablet = detectDeviceProfile({
      navigator: {
        maxTouchPoints: 5,
        platform: "Android",
        userAgent: "Mozilla/5.0 (Linux; Android 16)",
      },
      window: { matchMedia: matchMedia(true) },
    });

    expect(phone.deviceClass).toBe("phone");
    expect(tablet.deviceClass).toBe("tablet");
  });

  it("keeps touch-capable desktop computers in the desktop class", () => {
    expect(
      detectDeviceProfile({
        navigator: {
          maxTouchPoints: 10,
          platform: "Win32",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
        window: { matchMedia: matchMedia(true, true) },
      }),
    ).toMatchObject({ deviceClass: "desktop", inputMode: "hybrid" });
  });
});
