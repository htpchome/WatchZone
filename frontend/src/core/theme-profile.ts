import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { HomeAssistant } from "./home-assistant";

export type ThemeMode = "dark" | "light";
export type ThemeProfileSource = "home_assistant" | "system";

export interface ThemeProfile {
  readonly defaultDarkThemeName?: string;
  readonly defaultThemeName?: string;
  readonly hasExplicitDarkVariant: boolean;
  readonly hasExplicitLightVariant: boolean;
  readonly isDark: boolean;
  readonly isDefaultTheme: boolean;
  readonly mode: ThemeMode;
  readonly name?: string;
  readonly source: ThemeProfileSource;
}

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

export function resolveThemeProfile(
  hass: Pick<HomeAssistant, "themes"> | undefined,
  systemDark = false,
): ThemeProfile {
  const themes = hass?.themes;
  const hasHomeAssistantMode = typeof themes?.darkMode === "boolean";
  const isDark = hasHomeAssistantMode ? themes.darkMode : systemDark;
  const name = nonEmptyString(themes?.theme);
  const defaultThemeName = nonEmptyString(themes?.default_theme);
  const defaultDarkThemeName = nonEmptyString(themes?.default_dark_theme);
  const activeTheme = name ? themes?.themes[name] : undefined;
  return {
    ...(defaultDarkThemeName ? { defaultDarkThemeName } : {}),
    ...(defaultThemeName ? { defaultThemeName } : {}),
    hasExplicitDarkVariant: Boolean(activeTheme?.modes?.dark),
    hasExplicitLightVariant: Boolean(activeTheme?.modes?.light),
    isDark,
    isDefaultTheme: Boolean(
      name && (name === defaultThemeName || name === defaultDarkThemeName),
    ),
    mode: isDark ? "dark" : "light",
    ...(name ? { name } : {}),
    source: hasHomeAssistantMode ? "home_assistant" : "system",
  };
}

/** Keeps one host synchronized with HA's effective theme and system fallback. */
export class ThemeProfileController implements ReactiveController {
  private _hass?: HomeAssistant;
  private readonly _systemDark =
    typeof matchMedia === "function"
      ? matchMedia(SYSTEM_DARK_QUERY)
      : undefined;

  public profile: ThemeProfile = resolveThemeProfile(
    undefined,
    this._systemDark?.matches,
  );

  public constructor(
    private readonly _host: ReactiveControllerHost & HTMLElement,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    this._systemDark?.addEventListener("change", this._handleSystemChange);
    this._apply(resolveThemeProfile(this._hass, this._systemDark?.matches));
  }

  public hostDisconnected(): void {
    this._systemDark?.removeEventListener("change", this._handleSystemChange);
  }

  public setHomeAssistant(hass: HomeAssistant): void {
    this._hass = hass;
    this._apply(resolveThemeProfile(hass, this._systemDark?.matches));
  }

  private _apply(profile: ThemeProfile): void {
    if (
      themeProfileSignature(profile) === themeProfileSignature(this.profile)
    ) {
      this._syncHost(profile);
      return;
    }
    this.profile = profile;
    this._syncHost(profile);
    this._host.requestUpdate();
  }

  private _syncHost(profile: ThemeProfile): void {
    this._host.dataset.themeMode = profile.mode;
    if (profile.name) this._host.dataset.themeName = profile.name;
    else delete this._host.dataset.themeName;
  }

  private readonly _handleSystemChange = (): void => {
    this._apply(resolveThemeProfile(this._hass, this._systemDark?.matches));
  };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function themeProfileSignature(profile: ThemeProfile): string {
  return JSON.stringify(profile);
}
