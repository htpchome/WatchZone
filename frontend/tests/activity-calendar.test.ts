import { afterEach, describe, expect, it, vi } from "vitest";

import { ACTIVITY_CALENDAR_TAG } from "../src/core/constants";
import type { HomeAssistantApi } from "../src/core/home-assistant";
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
    const callWS = vi.fn().mockResolvedValue({
      items: [
        review("today", Date.UTC(2026, 10, 9, 8) / 1000),
        review("yesterday", Date.UTC(2026, 10, 8, 8) / 1000),
      ],
    });
    const api = {
      callWS,
      identity: {},
      locale: {
        first_weekday: "monday",
        language: "en",
        time_zone: "UTC",
      },
      resolveUrl: (path: string) => path,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    const cameraSelection = new CameraSelectionContext();
    const dateContext = new MediaDateContext();
    const calendar = document.createElement(
      ACTIVITY_CALENDAR_TAG,
    ) as ActivityCalendar;
    calendar.api = api;
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

    expect(callWS).not.toHaveBeenCalled();
    await calendar.updateComplete;
    calendar.shadowRoot
      ?.querySelector<HTMLButtonElement>(".calendar-trigger")
      ?.click();
    await calendar.updateComplete;

    await vi.waitFor(() => expect(callWS).toHaveBeenCalled());
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
    const api = {
      callWS: vi.fn(),
      identity: {},
      locale: { language: "en", time_zone: "UTC" },
      resolveUrl: (path: string) => path,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    const cameraSelection = new CameraSelectionContext();
    const dateContext = new MediaDateContext();
    const calendar = document.createElement(
      ACTIVITY_CALENDAR_TAG,
    ) as ActivityCalendar;
    calendar.api = api;
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
  });
});

function review(id: string, startTime: number) {
  return {
    camera: "front",
    classification: "alert",
    clip_url: null,
    end_time: startTime + 1,
    id,
    labels: ["person"],
    media_end_time: startTime + 6,
    media_start_time: startTime - 5,
    playback_sources: [],
    preferred_transport: "file",
    related_event_ids: [],
    reviewed: false,
    revision: id,
    snapshot_url: null,
    start_time: startTime,
    sub_labels: [],
    thumbnail_url: null,
    zones: [],
  };
}
