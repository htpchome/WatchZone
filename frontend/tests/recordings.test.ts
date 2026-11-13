import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RECORDED_MEDIA_OPEN_EVENT,
  RECORDINGS_TAG,
} from "../src/core/constants";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import { CameraSelectionContext } from "../src/stage/camera-selection-context";
import { MediaDateContext } from "../src/stage/media-date-context";
import type { RecordingsModule } from "../src/stage/modules/recordings/recordings";
import "../src/stage/modules/recordings/recordings";

describe("recordings module", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders hourly ranges and opens or downloads provider media", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 9, 22, 27));
    const callWS = vi.fn().mockResolvedValue({
      days: ["2026-11-09", "2026-11-08"],
      hours: [
        {
          camera: "front",
          download_url: "/recording.mp4",
          duration: 1641,
          end_time: Date.UTC(2026, 10, 9, 22, 27, 21) / 1000,
          id: "frigate:front:hour",
          markers: [],
          playback_sources: [
            {
              content_type: "application/vnd.apple.mpegurl",
              transport: "hls",
              url: "/recording.m3u8",
            },
          ],
          preferred_transport: "hls",
          revision: "revision",
          selection_end_time: Date.UTC(2026, 10, 9, 22, 27, 21) / 1000,
          selection_spans: [
            {
              end_time: Date.UTC(2026, 10, 9, 22, 27, 21) / 1000,
              start_time: Date.UTC(2026, 10, 9, 22) / 1000,
            },
          ],
          selection_start_time: Date.UTC(2026, 10, 9, 22) / 1000,
          spans: [
            {
              end_time: Date.UTC(2026, 10, 9, 22, 27, 21) / 1000,
              media_offset: 0,
              start_time: Date.UTC(2026, 10, 9, 22) / 1000,
            },
          ],
          start_time: Date.UTC(2026, 10, 9, 22) / 1000,
          timeline_end_time: Date.UTC(2026, 10, 9, 23) / 1000,
          timeline_start_time: Date.UTC(2026, 10, 9, 22) / 1000,
        },
      ],
    });
    const api = {
      callWS,
      identity: {},
      locale: { language: "en", time_format: "12", time_zone: "UTC" },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    const selection = new CameraSelectionContext();
    const mediaDate = new MediaDateContext();
    const module = document.createElement(RECORDINGS_TAG) as RecordingsModule;
    module.api = api;
    module.cameraSelection = selection;
    module.mediaDate = mediaDate;
    module.targetModuleId = "camera-module";
    document.body.append(module);
    selection.publish(
      "camera-module",
      {},
      {
        activeEntityId: "camera.front",
        items: [{ entityId: "camera.front", label: "Front" }],
      },
      vi.fn(),
    );

    await vi.waitFor(() =>
      expect(module.shadowRoot?.querySelectorAll(".tile")).toHaveLength(1),
    );
    expect(callWS).toHaveBeenCalledWith({
      type: "watchzone/recordings/list",
      entity_id: "camera.front",
      selected_date: "2026-11-09",
      timezone: "UTC",
    });
    const availableDates = vi.fn();
    mediaDate.subscribeAvailableDates("camera.front", availableDates);
    expect(availableDates).toHaveBeenLastCalledWith([
      "2026-11-09",
      "2026-11-08",
    ]);
    await vi.waitFor(() =>
      expect(
        module.shadowRoot?.querySelector('.day-navigation[slot="previous"]'),
      ).not.toBeNull(),
    );
    const previousDay = module.shadowRoot?.querySelector<HTMLButtonElement>(
      '.day-navigation[slot="previous"]',
    );
    expect(previousDay?.getAttribute("aria-label")).toContain("Nov 8");
    expect(
      module.shadowRoot?.querySelector('.day-navigation[slot="next"]'),
    ).toBeNull();
    previousDay?.click();
    await vi.waitFor(() =>
      expect(callWS).toHaveBeenLastCalledWith({
        type: "watchzone/recordings/list",
        entity_id: "camera.front",
        selected_date: "2026-11-08",
        timezone: "UTC",
      }),
    );
    await vi.waitFor(() =>
      expect(
        module.shadowRoot?.querySelector('.day-navigation[slot="next"]'),
      ).not.toBeNull(),
    );
    expect(
      module.shadowRoot?.querySelector('.day-navigation[slot="previous"]'),
    ).toBeNull();
    await vi.waitFor(() =>
      expect(
        module.shadowRoot?.querySelector(".tile:not(.skeleton)"),
      ).not.toBeNull(),
    );
    expect(
      module.shadowRoot
        ?.querySelector("wzc-media-day-header")
        ?.shadowRoot?.querySelector(".label")?.textContent,
    ).toContain("Sun, Nov 8 — Recordings");
    expect(module.shadowRoot?.querySelector(".range")?.textContent).toBe(
      "10:00 PM – 10:27 PM",
    );
    expect(module.shadowRoot?.querySelector(".duration")?.textContent).toBe(
      "27m 21s",
    );
    const append = vi.spyOn(document.body, "append");
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    callWS.mockResolvedValueOnce({
      path: "/recording.mp4?download=true&authSig=test",
    });
    module.shadowRoot?.querySelector<HTMLButtonElement>(".download")?.click();
    await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(callWS).toHaveBeenLastCalledWith({
      type: "auth/sign_path",
      path: "/recording.mp4?download=true",
      expires: 3600,
    });
    const anchor = append.mock.calls.find(
      ([node]) => node instanceof HTMLAnchorElement,
    )?.[0] as HTMLAnchorElement | undefined;
    expect(anchor?.href).toBe(
      "https://ha.local/recording.mp4?download=true&authSig=test",
    );
    expect(anchor?.download).toBe("front-1794261600.mp4");

    const open = vi.fn();
    module.addEventListener(RECORDED_MEDIA_OPEN_EVENT, open);
    module.shadowRoot
      ?.querySelector<HTMLButtonElement>(".tile-player")
      ?.click();
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0]?.[0].detail).toEqual(
      expect.objectContaining({
        id: "frigate:front:hour",
        kind: "video",
        preferredTransport: "hls",
        timeline: expect.objectContaining({
          endTime: Date.UTC(2026, 10, 9, 23) / 1000,
          startTime: Date.UTC(2026, 10, 9, 22) / 1000,
        }),
      }),
    );
  });

  it("renders disabled, labeled hourly rows while the first request loads", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 9, 4, 30));
    let resolveRequest: ((value: unknown) => void) | undefined;
    const api = {
      callWS: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          }),
      ),
      identity: {},
      locale: { language: "en", time_format: "12", time_zone: "UTC" },
      resolveUrl: (path: string) => path,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    const selection = new CameraSelectionContext();
    const module = document.createElement(RECORDINGS_TAG) as RecordingsModule;
    module.api = api;
    module.cameraSelection = selection;
    module.mediaDate = new MediaDateContext();
    module.targetModuleId = "camera-module";
    document.body.append(module);
    selection.publish(
      "camera-module",
      {},
      {
        activeEntityId: "camera.front",
        items: [{ entityId: "camera.front", label: "Front" }],
      },
      vi.fn(),
    );

    await vi.waitFor(() =>
      expect(module.shadowRoot?.querySelectorAll(".skeleton")).toHaveLength(5),
    );
    expect(
      module.shadowRoot?.querySelector(".skeleton .range")?.textContent,
    ).toBe("4:00 AM – 5:00 AM");
    expect(
      module.shadowRoot?.querySelector<HTMLButtonElement>(".skeleton .download")
        ?.disabled,
    ).toBe(true);
    resolveRequest?.({ days: [], hours: [] });
  });

  it("keeps overlapping grouped-camera recordings as distinct A/B rows", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 9, 22, 27));
    const callWS = vi.fn(async (message: Record<string, unknown>) => ({
      days: ["2026-11-09"],
      hours: [
        recordingHour(
          String(message.entity_id).endsWith("driveway") ? "driveway" : "porch",
        ),
      ],
    }));
    const api = {
      callWS,
      identity: {},
      locale: { language: "en", time_format: "12", time_zone: "UTC" },
      resolveUrl: (path: string) => path,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    const selection = new CameraSelectionContext();
    const module = document.createElement(RECORDINGS_TAG) as RecordingsModule;
    module.api = api;
    module.cameraSelection = selection;
    module.mediaDate = new MediaDateContext();
    module.targetModuleId = "camera-module";
    document.body.append(module);
    selection.publish(
      "camera-module",
      {},
      {
        activeEntityId: "camera.porch",
        activeEntityIds: ["camera.porch", "camera.driveway"],
        activeSelectionId: "camera.porch",
        items: [
          {
            entityId: "camera.porch",
            entityIds: ["camera.porch", "camera.driveway"],
            label: "Group A/B",
          },
        ],
      },
      vi.fn(),
    );

    await vi.waitFor(() =>
      expect(module.shadowRoot?.querySelectorAll(".tile")).toHaveLength(2),
    );
    expect(
      [...(module.shadowRoot?.querySelectorAll(".group-position") ?? [])].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual(["A", "B"]);
    expect(callWS).toHaveBeenCalledWith(
      expect.objectContaining({ entity_id: "camera.porch" }),
    );
    expect(callWS).toHaveBeenCalledWith(
      expect.objectContaining({ entity_id: "camera.driveway" }),
    );

    const open = vi.fn();
    module.addEventListener(RECORDED_MEDIA_OPEN_EVENT, open);
    module.shadowRoot
      ?.querySelectorAll<HTMLButtonElement>(".tile-player")[1]
      ?.click();
    expect(open.mock.calls[0]?.[0].detail.timeline.entityId).toBe(
      "camera.driveway",
    );
  });

  it("keeps recordings from an available group member after a partial failure", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 9, 22, 27));
    const callWS = vi.fn(async (message: Record<string, unknown>) => {
      if (message.entity_id === "camera.driveway") {
        throw new Error("unavailable");
      }
      return {
        days: ["2026-11-09"],
        hours: [recordingHour("porch")],
      };
    });
    const api = {
      callWS,
      identity: {},
      locale: { language: "en", time_format: "12", time_zone: "UTC" },
      resolveUrl: (path: string) => path,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    const selection = new CameraSelectionContext();
    const module = document.createElement(RECORDINGS_TAG) as RecordingsModule;
    module.api = api;
    module.cameraSelection = selection;
    module.mediaDate = new MediaDateContext();
    module.targetModuleId = "camera-module";
    document.body.append(module);
    selection.publish(
      "camera-module",
      {},
      {
        activeEntityId: "camera.porch",
        activeEntityIds: ["camera.porch", "camera.driveway"],
        activeSelectionId: "camera.porch",
        items: [{ entityId: "camera.porch", label: "Group A/B" }],
      },
      vi.fn(),
    );

    await vi.waitFor(() =>
      expect(module.shadowRoot?.querySelectorAll(".tile")).toHaveLength(1),
    );
    expect(
      module.shadowRoot?.querySelector(".group-position")?.textContent,
    ).toBe("A");
  });
});

function recordingHour(camera: string) {
  const start = Date.UTC(2026, 10, 9, 22) / 1000;
  const end = start + 60;
  return {
    camera,
    download_url: `/${camera}.mp4`,
    duration: 60,
    end_time: end,
    id: `frigate:${camera}:hour`,
    markers: [],
    playback_sources: [],
    preferred_transport: "file",
    revision: "revision",
    selection_end_time: end,
    selection_spans: [{ end_time: end, start_time: start }],
    selection_start_time: start,
    spans: [{ end_time: end, media_offset: 0, start_time: start }],
    start_time: start,
    timeline_end_time: start + 3600,
    timeline_start_time: start,
  };
}
