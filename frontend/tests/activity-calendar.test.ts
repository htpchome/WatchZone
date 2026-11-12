import { afterEach, describe, expect, it, vi } from "vitest";

import { ACTIVITY_CALENDAR_TAG } from "../src/core/constants";
import "../src/stage/activity";
import type { ActivityCalendar } from "../src/stage/activity";
import { CameraSelectionContext } from "../src/stage/camera-selection-context";
import { MediaDateContext } from "../src/stage/media-date-context";

describe("activity calendar", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("marks review dates and publishes a persistent date selection", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 9, 12));
    const cameraSelection = new CameraSelectionContext();
    const dateContext = new MediaDateContext();
    const calendar = document.createElement(
      ACTIVITY_CALENDAR_TAG,
    ) as ActivityCalendar;
    calendar.locale = {
      first_weekday: "monday",
      language: "en",
      time_zone: "UTC",
    };
    calendar.cameraSelection = cameraSelection;
    calendar.dateContext = dateContext;
    calendar.historyDays = 5;
    calendar.targetModuleId = "camera-module";
    document.body.append(calendar);
    cameraSelection.publish(
      "camera-module",
      {},
      {
        activeEntityId: "camera.front",
        items: [{ entityId: "camera.front", label: "Front" }],
      },
      vi.fn(),
    );

    dateContext.publishAvailableDates("camera.front", calendar, [
      "2026-11-09",
      "2026-11-08",
    ]);
    await calendar.updateComplete;
    calendar.shadowRoot
      ?.querySelector<HTMLButtonElement>(".calendar-trigger")
      ?.click();
    await calendar.updateComplete;

    await vi.waitFor(() =>
      expect(calendar.shadowRoot?.querySelectorAll(".day.marked")).toHaveLength(
        2,
      ),
    );
    expect(
      [...(calendar.shadowRoot?.querySelectorAll(".weekday") ?? [])].map(
        ({ textContent }) => textContent,
      )[0],
    ).toMatch(/^Mon/);
    calendar.shadowRoot
      ?.querySelector<HTMLButtonElement>('.day[aria-label^="November 8, 2026"]')
      ?.click();
    expect(dateContext.selectedDate("camera.front")).toBe("2026-11-08");

    calendar.shadowRoot
      ?.querySelector<HTMLButtonElement>(".calendar-trigger")
      ?.click();
    await calendar.updateComplete;
    calendar.shadowRoot?.querySelector<HTMLButtonElement>(".reset")?.click();
    expect(dateContext.selectedDate("camera.front")).toBeUndefined();
  });

  it("uses recording availability when the recordings module is active", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 9, 12));
    const cameraSelection = new CameraSelectionContext();
    const dateContext = new MediaDateContext();
    const calendar = document.createElement(
      ACTIVITY_CALENDAR_TAG,
    ) as ActivityCalendar;
    calendar.locale = { language: "en", time_zone: "UTC" };
    calendar.cameraSelection = cameraSelection;
    calendar.dateContext = dateContext;
    calendar.historyDays = 5;
    calendar.mode = "recordings";
    calendar.targetModuleId = "camera-module";
    document.body.append(calendar);
    cameraSelection.publish(
      "camera-module",
      {},
      {
        activeEntityId: "camera.front",
        items: [{ entityId: "camera.front", label: "Front" }],
      },
      vi.fn(),
    );
    dateContext.publishAvailableDates("camera.front", calendar, [
      "2026-11-09",
      "2026-11-07",
      "2026-09-01",
    ]);

    await calendar.updateComplete;
    calendar.shadowRoot
      ?.querySelector<HTMLButtonElement>(".calendar-trigger")
      ?.click();

    await vi.waitFor(() =>
      expect(calendar.shadowRoot?.querySelectorAll(".day.marked")).toHaveLength(
        2,
      ),
    );
    expect(
      calendar.shadowRoot
        ?.querySelector<HTMLButtonElement>(
          '.day[aria-label^="November 7, 2026"]',
        )
        ?.getAttribute("aria-label"),
    ).toContain("has recordings");

    const previous = calendar.shadowRoot?.querySelector<HTMLButtonElement>(
      '.month-button[aria-label="Previous month"]',
    );
    previous?.click();
    await calendar.updateComplete;
    calendar.shadowRoot
      ?.querySelector<HTMLButtonElement>(
        '.month-button[aria-label="Previous month"]',
      )
      ?.click();
    await calendar.updateComplete;
    expect(
      calendar.shadowRoot
        ?.querySelector<HTMLButtonElement>(
          '.day[aria-label^="September 1, 2026"]',
        )
        ?.getAttribute("aria-label"),
    ).toContain("has recordings");
  });
});
