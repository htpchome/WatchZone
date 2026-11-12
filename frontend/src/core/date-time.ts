import type { HomeAssistantLocale } from "./home-assistant";

/** Build an Intl formatter without allowing HA time-zone sentinels to throw. */
export function homeAssistantDateTimeFormat(
  locale: HomeAssistantLocale | undefined,
  options: Intl.DateTimeFormatOptions,
  language: string | undefined = locale?.language,
): Intl.DateTimeFormat {
  const timeZone = intlTimeZone(locale?.time_zone);
  const resolvedOptions = timeZone ? { ...options, timeZone } : options;
  try {
    return new Intl.DateTimeFormat(language, resolvedOptions);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return new Intl.DateTimeFormat(language, options);
  }
}

/** Resolve an IANA zone; `local`, `server`, and invalid values use local time. */
export function intlTimeZone(value: string | undefined): string | undefined {
  if (!value || value === "local" || value === "server") return undefined;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

/** Resolve Home Assistant's selected zone, including its local sentinel. */
export function resolvedHomeAssistantTimeZone(
  locale: HomeAssistantLocale | undefined,
): string {
  return (
    intlTimeZone(locale?.time_zone) ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC"
  );
}

/** Format the effective IANA zone with a localized generic display name. */
export function formatHomeAssistantTimeZone(
  locale: HomeAssistantLocale | undefined,
): string {
  const timeZone = resolvedHomeAssistantTimeZone(locale);
  try {
    const displayName = new Intl.DateTimeFormat(locale?.language, {
      timeZone,
      timeZoneName: "longGeneric",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    return displayName && displayName !== timeZone
      ? `${displayName} (${timeZone})`
      : timeZone;
  } catch (error) {
    if (error instanceof RangeError) return timeZone;
    throw error;
  }
}

export function homeAssistantHour12(
  locale: HomeAssistantLocale | undefined,
): boolean | undefined {
  if (locale?.time_format === "12") return true;
  if (locale?.time_format === "24") return false;
  return undefined;
}

export function formatHomeAssistantTime(
  date: Date,
  locale: HomeAssistantLocale | undefined,
): string {
  const language =
    locale?.time_format === "system" ? undefined : locale?.language;
  return homeAssistantDateTimeFormat(
    locale,
    {
      hour: "numeric",
      hour12: homeAssistantHour12(locale),
      minute: "2-digit",
    },
    language,
  ).format(date);
}

export function formatHomeAssistantDate(
  date: Date,
  locale: HomeAssistantLocale | undefined,
): string {
  const language =
    locale?.date_format === "system" ? undefined : locale?.language;
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "numeric",
    weekday: "short",
    year: "numeric",
  };
  const order = locale?.date_format;
  if (order !== "DMY" && order !== "MDY" && order !== "YMD") {
    return homeAssistantDateTimeFormat(locale, options, language).format(date);
  }

  const dateParts = homeAssistantDateTimeFormat(
    locale,
    { day: "numeric", month: "numeric", year: "numeric" },
    language,
  ).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    dateParts.find((value) => value.type === type)?.value ?? "";
  const separator =
    dateParts.find((value) => value.type === "literal")?.value ?? "/";
  const values = {
    DMY: [part("day"), part("month"), part("year")],
    MDY: [part("month"), part("day"), part("year")],
    YMD: [part("year"), part("month"), part("day")],
  } as const;
  const weekday = homeAssistantDateTimeFormat(
    locale,
    { weekday: "short" },
    language,
  ).format(date);
  return `${weekday}, ${values[order].join(separator)}`;
}

/** Compact localized event date such as `Thu, Nov 5` or `Do., 5. Nov.`. */
export function formatHomeAssistantEventDate(
  date: Date,
  locale: HomeAssistantLocale | undefined,
): string {
  const language =
    locale?.date_format === "system" ? undefined : locale?.language;
  return homeAssistantDateTimeFormat(
    locale,
    { day: "numeric", month: "short", weekday: "short" },
    language,
  ).format(date);
}

/** Format a civil `YYYY-MM-DD` date without shifting it through a time zone. */
export function formatHomeAssistantDateKey(
  dateKey: string,
  locale: HomeAssistantLocale | undefined,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  const [, year, month, day] = match;
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 12),
  );
  return formatHomeAssistantEventDate(date, {
    ...locale,
    language: locale?.language ?? "en",
    time_zone: "UTC",
  });
}

/** Stable YYYY-MM-DD key for an instant in Home Assistant's selected zone. */
export function homeAssistantDateKey(
  timestampSeconds: number,
  locale: HomeAssistantLocale | undefined,
): string {
  const parts = homeAssistantDateTimeFormat(
    locale,
    { day: "2-digit", month: "2-digit", year: "numeric" },
    "en-CA",
  ).formatToParts(new Date(timestampSeconds * 1000));
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
