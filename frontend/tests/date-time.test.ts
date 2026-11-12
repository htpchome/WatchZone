import { describe, expect, it } from "vitest";

import {
  formatHomeAssistantDate,
  formatHomeAssistantDateKey,
  formatHomeAssistantEventDate,
  formatHomeAssistantTime,
  formatHomeAssistantTimeZone,
  homeAssistantDateTimeFormat,
  intlTimeZone,
} from "../src/core/date-time";

describe("Home Assistant date and time formatting", () => {
  it.each(["server", "local", "not/a-real-zone"])(
    "falls back safely for %s",
    (time_zone) => {
      expect(() =>
        homeAssistantDateTimeFormat(
          { language: "en", time_zone },
          { hour: "numeric", minute: "2-digit" },
        ).format(new Date(0)),
      ).not.toThrow();
      expect(intlTimeZone(time_zone)).toBeUndefined();
    },
  );

  it("preserves a valid IANA time zone", () => {
    expect(intlTimeZone("America/New_York")).toBe("America/New_York");
  });

  it("formats the effective time zone with a localized display name", () => {
    expect(
      formatHomeAssistantTimeZone({
        language: "en-US",
        time_zone: "America/Chicago",
      }),
    ).toBe("Central Time (America/Chicago)");
  });

  it("formats compact event dates in the selected locale", () => {
    const date = new Date("2026-11-05T18:00:00Z");
    expect(
      formatHomeAssistantEventDate(date, {
        language: "en-US",
        time_zone: "UTC",
      }),
    ).toBe("Thu, Nov 5");
    expect(
      formatHomeAssistantEventDate(date, {
        language: "de-DE",
        time_zone: "UTC",
      }),
    ).toBe("Do., 5. Nov.");
  });

  it("formats civil date keys without time-zone date shifts", () => {
    expect(
      formatHomeAssistantDateKey("2026-11-09", {
        language: "en-US",
        time_zone: "Pacific/Kiritimati",
      }),
    ).toBe("Mon, Nov 9");
    expect(
      formatHomeAssistantDateKey("2026-11-09", {
        language: "de-DE",
        time_zone: "America/Adak",
      }),
    ).toBe("Mo., 9. Nov.");
  });

  it("honors explicit HA time and date formats", () => {
    const date = new Date("2023-11-14T22:13:20Z");
    const locale = {
      date_format: "DMY",
      language: "en",
      time_format: "12",
      time_zone: "America/New_York",
    };

    expect(formatHomeAssistantTime(date, locale)).toBe("5:13 PM");
    expect(formatHomeAssistantDate(date, locale)).toBe("Tue, 14/11/2023");
  });
});
