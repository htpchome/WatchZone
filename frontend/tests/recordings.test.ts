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
          playback_sources: [
            {
              content_type: "application/vnd.apple.mpegurl",
              transport: "hls",
              url: "/recording.m3u8",
            },
          ],
          preferred_transport: "hls",
          revision: "revision",
          start_time: Date.UTC(2026, 10, 9, 22) / 1000,
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
});
