import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraSelectionContext } from "../src/core/camera-selection-context";
import { EVENTS_TAG } from "../src/core/constants";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { EventsModule } from "../src/modules/events/events";
import "../src/modules/events/events";

const event = {
  camera: "front",
  clip_url: "/clip.mp4",
  end_time: 124,
  has_clip: true,
  has_snapshot: true,
  id: "frigate:event-1",
  label: "person",
  revision: "revision-1",
  snapshot_url: "/snapshot.jpg",
  start_time: 100,
  sub_label: "Resident",
  thumbnail_url: "/thumbnail.jpg",
};

describe("events module", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("queries the active camera and replaces an authoritative event window", async () => {
    const callWS = vi
      .fn()
      .mockResolvedValueOnce({ items: [event] })
      .mockResolvedValueOnce({ items: [] });
    const api = {
      callWS,
      identity: {},
      locale: { language: "en", time_zone: "server" },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    const selection = new CameraSelectionContext();
    const module = document.createElement(EVENTS_TAG) as EventsModule;
    module.api = api;
    module.cameraSelection = selection;
    module.historyDays = 7;
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

    await vi.waitFor(() => {
      expect(module.shadowRoot?.querySelectorAll(".tile")).toHaveLength(1);
    });
    expect(callWS).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "watchzone/events/list",
        entity_id: "camera.front",
        limit: 500,
      }),
    );
    const query = callWS.mock.calls[0]?.[0] as {
      after: number;
      before: number;
    };
    expect(query.before - query.after).toBe(7 * 24 * 60 * 60);
    expect(module.shadowRoot?.textContent).toContain("Resident");
    expect(
      module.shadowRoot?.querySelector<HTMLImageElement>(".thumbnail")?.src,
    ).toBe("https://ha.local/snapshot.jpg");
    expect(
      module.shadowRoot
        ?.querySelector(".viewport")
        ?.classList.contains("square"),
    ).toBe(false);

    selection.publish(
      "camera-module",
      {},
      {
        activeEntityId: "camera.back",
        items: [{ entityId: "camera.back", label: "Back" }],
      },
      vi.fn(),
    );
    await vi.waitFor(() => {
      expect(module.shadowRoot?.querySelectorAll(".tile")).toHaveLength(0);
      expect(module.shadowRoot?.textContent).toContain("No recent events");
    });
  });
});
