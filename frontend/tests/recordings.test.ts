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
    module.historyDays = 5;
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
    expect(callWS).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "watchzone/recordings/list",
        entity_id: "camera.front",
        selected_date: "2026-11-09",
        timezone: "UTC",
      }),
    );
    const availableDates = vi.fn();
    mediaDate.subscribeAvailableDates("camera.front", availableDates);
    expect(availableDates).toHaveBeenLastCalledWith([
      "2026-11-09",
      "2026-11-08",
    ]);
    expect(module.shadowRoot?.querySelector(".range")?.textContent).toBe(
      "10:00 PM – 10:27 PM",
    );
    expect(module.shadowRoot?.querySelector(".duration")?.textContent).toBe(
      "27m 21s",
    );
    expect(
      module.shadowRoot?.querySelector<HTMLAnchorElement>(".download")?.href,
    ).toBe("https://ha.local/recording.mp4");

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
});
