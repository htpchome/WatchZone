import { describe, expect, it } from "vitest";

import { detectDeviceProfile } from "../src/core/device-profile";

function matchMedia(matches: readonly string[]) {
  return (query: string) => ({ matches: matches.includes(query) });
}

describe("device profile", () => {
  it.each([
    [320, "phone", "compact_phone"],
    [480, "phone", "phone"],
    [600, "tablet", "compact_tablet"],
    [768, "tablet", "tablet"],
    [1024, "desktop", "desktop"],
    [1440, "desktop", "wide_desktop"],
  ] as const)(
    "classifies a %ipx container as %s/%s",
    (inlineSize, deviceClass, deviceSizeClass) => {
      expect(
        detectDeviceProfile({
          blockSize: 800,
          inlineSize,
          window: { matchMedia: matchMedia([]) },
        }),
      ).toMatchObject({ deviceClass, deviceSizeClass });
    },
  );

  it("classifies touch, pointer, and hover capabilities independently", () => {
    expect(
      detectDeviceProfile({
        blockSize: 700,
        inlineSize: 1200,
        navigator: { maxTouchPoints: 10 },
        window: {
          matchMedia: matchMedia([
            "(pointer: coarse)",
            "(any-pointer: coarse)",
            "(any-pointer: fine)",
            "(any-hover: hover)",
          ]),
        },
      }),
    ).toMatchObject({
      anyHover: true,
      deviceClass: "desktop",
      hasTouch: true,
      inputMode: "hybrid",
      primaryHover: false,
      primaryPointer: "coarse",
    });
  });

  it("derives orientation from the observed container", () => {
    expect(
      detectDeviceProfile({
        blockSize: 500,
        inlineSize: 800,
        window: { matchMedia: matchMedia([]) },
      }).orientation,
    ).toBe("landscape");
    expect(
      detectDeviceProfile({
        blockSize: 800,
        inlineSize: 500,
        window: { matchMedia: matchMedia([]) },
      }).orientation,
    ).toBe("portrait");
  });

  it("does not infer layout behavior from platform identifiers", () => {
    expect(
      detectDeviceProfile({
        blockSize: 900,
        inlineSize: 1300,
        navigator: { maxTouchPoints: 5 },
        window: {
          matchMedia: matchMedia([
            "(pointer: coarse)",
            "(any-pointer: coarse)",
          ]),
        },
      }),
    ).toMatchObject({ deviceClass: "desktop", inputMode: "touch" });
  });
});
