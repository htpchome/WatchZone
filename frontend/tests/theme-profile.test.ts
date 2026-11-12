import { describe, expect, it } from "vitest";

import { resolveThemeProfile } from "../src/core/theme-profile";

describe("theme profile", () => {
  it("uses Home Assistant's effective mode and active theme metadata", () => {
    expect(
      resolveThemeProfile(
        {
          themes: {
            darkMode: true,
            default_dark_theme: "Frosted Glass",
            default_theme: "default",
            theme: "Frosted Glass",
            themes: {
              "Frosted Glass": {
                modes: { dark: {}, light: {} },
              },
            },
          },
        },
        false,
      ),
    ).toEqual({
      defaultDarkThemeName: "Frosted Glass",
      defaultThemeName: "default",
      hasExplicitDarkVariant: true,
      hasExplicitLightVariant: true,
      isDark: true,
      isDefaultTheme: true,
      mode: "dark",
      name: "Frosted Glass",
      source: "home_assistant",
    });
  });

  it("keeps Home Assistant authoritative over system color preference", () => {
    expect(
      resolveThemeProfile(
        {
          themes: {
            darkMode: false,
            default_theme: "default",
            theme: "Custom Light",
            themes: { "Custom Light": {} },
          },
        },
        true,
      ),
    ).toMatchObject({
      isDark: false,
      isDefaultTheme: false,
      mode: "light",
      name: "Custom Light",
      source: "home_assistant",
    });
  });

  it("falls back to the system preference without inventing theme metadata", () => {
    expect(resolveThemeProfile(undefined, true)).toEqual({
      hasExplicitDarkVariant: false,
      hasExplicitLightVariant: false,
      isDark: true,
      isDefaultTheme: false,
      mode: "dark",
      source: "system",
    });
  });
});
