import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraSelectionContext } from "../src/stage/camera-selection-context";
import { ActivityDateFilterContext } from "../src/stage/activity-date-filter-context";
import { ACTIVITY_LIST_TAG, EVENTS_TAG } from "../src/core/constants";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { EventsModule } from "../src/stage/modules/events/events";
import "../src/stage/modules/events/events";

const event = {
  camera: "front",
  clip_url: "/clip.mp4",
  end_time: 124,
  has_clip: true,
  has_snapshot: true,
  id: "frigate:event-1",
  label: "person",
  playback_sources: [
    { content_type: "video/mp4", transport: "file", url: "/clip.mp4" },
  ],
  preferred_transport: "file",
  revision: "revision-1",
  snapshot_url: "/snapshot.jpg",
  start_time: 100,
  sub_label: "Resident",
  thumbnail_url: "/thumbnail.jpg",
  zones: ["driveway"],
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
    const dateFilter = new ActivityDateFilterContext();
    const module = document.createElement(EVENTS_TAG) as EventsModule;
    module.api = api;
    module.activityDateFilter = dateFilter;
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
      expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(1);
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
    expect(activityRoot(module)?.textContent).toContain("Resident");
    expect(activityRoot(module)?.textContent).toContain("driveway");
    expect(
      activityRoot(module)?.querySelectorAll(".metadata-icon svg"),
    ).toHaveLength(3);
    expect(
      [...(activityRoot(module)?.querySelectorAll("wzc-badge") ?? [])].map(
        (badge) => badge.textContent?.trim(),
      ),
    ).toEqual(["Person", "Resident", "Clip"]);
    expect(
      activityRoot(module)?.querySelector<HTMLImageElement>(".thumbnail")?.src,
    ).toBe("https://ha.local/thumbnail.jpg");
    expect(
      activityRoot(module)?.querySelector("wzc-badge")?.getAttribute("shape"),
    ).toBe("pill");
    expect(
      activityRoot(module)?.querySelector("wzc-badge")?.getAttribute("size"),
    ).toBe("small");
    const open = vi.fn();
    module.addEventListener("wzc-recorded-media-open", open);
    activityRoot(module)
      ?.querySelector<HTMLButtonElement>(".tile-player")
      ?.click();
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0]?.[0].detail).toEqual(
      expect.objectContaining({
        id: event.id,
        kind: "video",
        preferredTransport: "file",
        title: expect.stringMatching(/^Front - .+ - .+$/),
      }),
    );
    open.mockClear();
    activityRoot(module)
      ?.querySelector<HTMLButtonElement>('button[aria-label="View snapshot"]')
      ?.click();
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0]?.[0].detail).toEqual(
      expect.objectContaining({
        id: `${event.id}:snapshot`,
        kind: "snapshot",
        sources: [
          expect.objectContaining({
            content_type: "image/jpeg",
            url: event.snapshot_url,
          }),
        ],
      }),
    );
    expect(
      activityRoot(module)
        ?.querySelector(".viewport")
        ?.classList.contains("square"),
    ).toBe(false);

    dateFilter.select("1970-01-02");
    await module.updateComplete;
    expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(0);
    dateFilter.reset();
    await module.updateComplete;
    expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(1);

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
      expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(0);
      expect(activityRoot(module)?.textContent).toContain("No recent events");
    });
  });

  it("falls back from a failed focused thumbnail to the event snapshot", async () => {
    const api = {
      callWS: vi.fn().mockResolvedValue({ items: [event] }),
      identity: {},
      locale: { language: "en", time_zone: "server" },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    const selection = new CameraSelectionContext();
    const module = document.createElement(EVENTS_TAG) as EventsModule;
    module.api = api;
    module.cameraSelection = selection;
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
      expect(
        activityRoot(module)?.querySelector<HTMLImageElement>(".thumbnail")
          ?.src,
      ).toBe("https://ha.local/thumbnail.jpg");
    });
    activityRoot(module)
      ?.querySelector<HTMLImageElement>(".thumbnail")
      ?.dispatchEvent(new Event("error"));
    await vi.waitFor(() => {
      expect(
        activityRoot(module)?.querySelector<HTMLImageElement>(".thumbnail")
          ?.src,
      ).toBe("https://ha.local/snapshot.jpg");
    });
    activityRoot(module)
      ?.querySelector<HTMLImageElement>(".thumbnail")
      ?.dispatchEvent(new Event("error"));
    await vi.waitFor(() => {
      expect(
        activityRoot(module)?.querySelector(".placeholder svg"),
      ).not.toBeNull();
    });
  });

  it("preserves loaded activity through a transient selection reconnect", async () => {
    const callWS = vi
      .fn()
      .mockResolvedValueOnce({ items: [event] })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [event] });
    const api = {
      callWS,
      identity: {},
      locale: { language: "en", time_zone: "server" },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    const selection = new CameraSelectionContext();
    const owner = {};
    const module = document.createElement(EVENTS_TAG) as EventsModule;
    module.api = api;
    module.cameraSelection = selection;
    module.targetModuleId = "camera-module";
    document.body.append(module);
    const publish = (): void =>
      selection.publish(
        "camera-module",
        owner,
        {
          activeEntityId: "camera.front",
          items: [{ entityId: "camera.front", label: "Front" }],
        },
        vi.fn(),
      );
    publish();

    await vi.waitFor(() => {
      expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(1);
    });
    selection.clear("camera-module", owner);
    await module.updateComplete;
    expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(1);

    publish();
    await vi.waitFor(() => expect(callWS).toHaveBeenCalledTimes(2));
    expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(1);
    await vi.waitFor(() => expect(callWS).toHaveBeenCalledTimes(3), {
      timeout: 2_500,
    });
    expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(1);
  });

  it("independently hides object and event-type badges", async () => {
    const api = {
      callWS: vi.fn().mockResolvedValue({ items: [event] }),
      identity: {},
      locale: { language: "en", time_zone: "server" },
      resolveUrl: (path: string) => `https://ha.local${path}`,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    const selection = new CameraSelectionContext();
    const module = document.createElement(EVENTS_TAG) as EventsModule;
    module.api = api;
    module.cameraSelection = selection;
    module.displayEventTypeBadges = false;
    module.displayObjectBadges = false;
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
      expect(activityRoot(module)?.querySelectorAll(".tile")).toHaveLength(1);
    });
    expect(activityRoot(module)?.querySelectorAll("wzc-badge")).toHaveLength(0);
  });
});

function activityRoot(module: EventsModule): ShadowRoot | null | undefined {
  return module.shadowRoot?.querySelector(ACTIVITY_LIST_TAG)?.shadowRoot;
}
