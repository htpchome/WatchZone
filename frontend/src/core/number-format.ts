import type { HomeAssistantLocale } from "./home-assistant";

/** Match Home Assistant's locale selection for user-formatted numbers. */
export function homeAssistantNumberFormat(
  locale: HomeAssistantLocale | undefined,
  options: Intl.NumberFormatOptions = {},
): Intl.NumberFormat {
  const numberLocale = numberFormatLocale(locale);
  return new Intl.NumberFormat(numberLocale, {
    maximumFractionDigits: 2,
    ...(locale?.number_format === "none" ? { useGrouping: false } : {}),
    ...options,
  });
}

function numberFormatLocale(
  locale: HomeAssistantLocale | undefined,
): string | string[] | undefined {
  switch (locale?.number_format) {
    case "comma_decimal":
      return ["en-US", "en"];
    case "decimal_comma":
      return ["de", "es", "it"];
    case "space_comma":
      return ["fr", "sv", "cs"];
    case "quote_decimal":
      return ["de-CH"];
    case "none":
      return "en-US";
    case "system":
      return undefined;
    default:
      return locale?.language;
  }
}
