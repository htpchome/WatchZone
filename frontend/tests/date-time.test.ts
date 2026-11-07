import { describe, expect, it } from "vitest";

import {
  formatHomeAssistantDate,
  formatHomeAssistantTime,
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
