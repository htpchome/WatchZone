import { describe, expect, it } from "vitest";

import { normalizeCardConfig } from "../src/core/config";
import {
  CARD_TYPE,
  MAX_CARD_TITLE_LENGTH,
  MAX_CAMERAS,
  MAX_LIGHTS_PER_CAMERA,
} from "../src/core/constants";

describe("WatchZone card configuration", () => {
  it("sanitizes and bounds the card title", () => {
    const title = `  Front\u0000\n  Door   ${"x".repeat(80)}`;
    const normalized = normalizeCardConfig({ title }).title;
    expect(normalized).toBe(`Front Door ${"x".repeat(53)}`);
    expect(Array.from(normalized)).toHaveLength(MAX_CARD_TITLE_LENGTH);
  });

  it("defaults card appearance and starts with no cameras", () => {
    expect(normalizeCardConfig({ type: CARD_TYPE, title: "Camera" })).toEqual({
      type: CARD_TYPE,
      title: "Camera",
      camera_bar_rounded_corners: true,
      camera_bar_shadows: true,
      camera_rounded_corners: true,
      camera_shadows: true,
      display_event_type_badges: true,
      display_object_badges: true,
      display_zone: true,
      event_history_days: 5,
      event_rounded_corners: true,
      event_shadows: true,
      highlight_camera_on_activity: true,
      ptz_overlay_control: "start_open",
      slide_transition: "slide",
      view_timelapse_on_thumbnail_hover: true,
      rounded_outer_corners: true,
      outer_shadows: true,
      outer_padding: true,
      mobile_data_saving: false,
      cameras: [],
    });
  });

  it("defaults PTZ overlays open and validates supported presentations", () => {
    expect(normalizeCardConfig({}).ptz_overlay_control).toBe("start_open");
    expect(
      normalizeCardConfig({ ptz_overlay_control: "start_closed" })
        .ptz_overlay_control,
    ).toBe("start_closed");
    expect(
      normalizeCardConfig({ ptz_overlay_control: "none" }).ptz_overlay_control,
    ).toBe("none");
    expect(() =>
      normalizeCardConfig({ ptz_overlay_control: "open_in_drawer" }),
    ).toThrow("ptz_overlay_control must be none, start_closed, or start_open");
  });

  it("defaults carousel transitions to slide and validates supported effects", () => {
    expect(normalizeCardConfig({}).slide_transition).toBe("slide");
    expect(
      normalizeCardConfig({ slide_transition: "none" }).slide_transition,
    ).toBe("none");
    expect(
      normalizeCardConfig({ slide_transition: "fade" }).slide_transition,
    ).toBe("fade");
    expect(() => normalizeCardConfig({ slide_transition: "flip" })).toThrow(
      "slide_transition must be none, slide, or fade",
    );
  });

  it("defaults thumbnail timelapse previews on and accepts an explicit opt-out", () => {
    expect(normalizeCardConfig({}).view_timelapse_on_thumbnail_hover).toBe(
      true,
    );
    expect(
      normalizeCardConfig({ view_timelapse_on_thumbnail_hover: false })
        .view_timelapse_on_thumbnail_hover,
    ).toBe(false);
    expect(() =>
      normalizeCardConfig({ view_timelapse_on_thumbnail_hover: "false" }),
    ).toThrow("view_timelapse_on_thumbnail_hover must be a boolean");
  });

  it("defaults live activity highlighting on and accepts an explicit opt-out", () => {
    expect(normalizeCardConfig({}).highlight_camera_on_activity).toBe(true);
    expect(
      normalizeCardConfig({ highlight_camera_on_activity: false })
        .highlight_camera_on_activity,
    ).toBe(false);
    expect(() =>
      normalizeCardConfig({ highlight_camera_on_activity: "false" }),
    ).toThrow("highlight_camera_on_activity must be a boolean");
  });

  it("accepts an event history range from 1 through 15 days", () => {
    expect(
      normalizeCardConfig({ event_history_days: 12 }).event_history_days,
    ).toBe(12);
    for (const event_history_days of [0, 16, 1.5, "5"]) {
      expect(() => normalizeCardConfig({ event_history_days })).toThrow(
        "event_history_days must be an integer from 1 to 15",
      );
    }
  });

  it("normalizes per-camera defaults and preserves explicit options", () => {
    expect(
      normalizeCardConfig({
        cameras: [
          {
            entity_id: "camera.front",
            low_latency_hls: false,
            start_live_unmuted_pc_tablet: true,
          },
        ],
      }).cameras,
    ).toEqual([
      {
        connection: "home_assistant",
        entity_id: "camera.front",
        frigate_fallback: "mse",
        lights: [],
        low_latency_hls: false,
        ptz_enabled: false,
        start_live_unmuted_pc_tablet: true,
        start_live_unmuted_phone: false,
        title: "",
        two_way_talk_enabled: false,
      },
    ]);
  });

  it("normalizes the opt-in two-way-talk camera capability", () => {
    expect(
      normalizeCardConfig({
        cameras: [{ entity_id: "camera.front", two_way_talk_enabled: true }],
      }).cameras[0]?.two_way_talk_enabled,
    ).toBe(true);
  });

  it("keeps connection choice and controls independent in a mixed card", () => {
    const config = normalizeCardConfig({
      cameras: [
        { entity_id: "camera.hall" },
        { entity_id: "camera.doorbell" },
        {
          connection: "frigate_go2rtc",
          entity_id: "camera.workshop",
          ptz_enabled: true,
        },
        {
          connection: "frigate_go2rtc",
          entity_id: "camera.gate",
          two_way_talk_enabled: true,
        },
      ],
    });

    expect(config.cameras.map(({ connection }) => connection)).toEqual([
      "home_assistant",
      "home_assistant",
      "frigate_go2rtc",
      "frigate_go2rtc",
    ]);
    expect(config.cameras[2]?.ptz_enabled).toBe(true);
    expect(config.cameras[3]?.two_way_talk_enabled).toBe(true);
  });

  it("defaults Frigate to MSE and accepts an explicit HLS fallback", () => {
    const config = normalizeCardConfig({
      cameras: [
        { connection: "frigate_go2rtc", entity_id: "camera.front" },
        {
          connection: "frigate_go2rtc",
          entity_id: "camera.back",
          frigate_fallback: "hls",
        },
      ],
    });

    expect(
      config.cameras.map(({ frigate_fallback }) => frigate_fallback),
    ).toEqual(["mse", "hls"]);
  });

  it("normalizes the opt-in PTZ camera capability", () => {
    expect(
      normalizeCardConfig({
        cameras: [{ entity_id: "camera.front", ptz_enabled: true }],
      }).cameras[0]?.ptz_enabled,
    ).toBe(true);
  });

  it("normalizes linked-light metadata and migrates the legacy entity list", () => {
    expect(
      normalizeCardConfig({
        cameras: [
          {
            entity_id: "camera.front",
            light_entity_ids: ["light.porch", "light.driveway"],
          },
        ],
      }).cameras[0]?.lights,
    ).toEqual([{ entity_id: "light.porch" }, { entity_id: "light.driveway" }]);
    expect(
      normalizeCardConfig({
        cameras: [
          {
            entity_id: "camera.front",
            lights: [{ entity_id: "light.porch", icon: "mdi:coach-lamp" }],
          },
        ],
      }).cameras[0]?.lights,
    ).toEqual([{ entity_id: "light.porch", icon: "mdi:coach-lamp" }]);
    expect(() =>
      normalizeCardConfig({
        cameras: [
          {
            entity_id: "camera.front",
            lights: Array.from(
              { length: MAX_LIGHTS_PER_CAMERA + 1 },
              (_, index) => ({ entity_id: `light.${index}` }),
            ),
          },
        ],
      }),
    ).toThrow("supports at most 2 lights");
    expect(() =>
      normalizeCardConfig({
        cameras: [
          {
            entity_id: "camera.front",
            lights: [
              { entity_id: "light.porch" },
              { entity_id: "light.porch" },
            ],
          },
        ],
      }),
    ).toThrow("light entities must be unique");
    expect(() =>
      normalizeCardConfig({
        cameras: [
          {
            entity_id: "camera.front",
            lights: [{ entity_id: "switch.porch" }],
          },
        ],
      }),
    ).toThrow("must use light entities");
  });

  it("sanitizes and bounds optional camera titles", () => {
    expect(
      normalizeCardConfig({
        cameras: [
          {
            entity_id: "camera.front",
            title: "  Café!  42 / Patio 12345678901234567890",
          },
        ],
      }).cameras[0]?.title,
    ).toBe("Café 42 Patio 1234567890");
    expect(() =>
      normalizeCardConfig({
        cameras: [{ entity_id: "camera.front", title: 42 }],
      }),
    ).toThrow("camera 1 title must be a string");
  });

  it("migrates the legacy single-camera shape", () => {
    expect(
      normalizeCardConfig({
        camera_entity: "camera.front",
        low_latency_hls: false,
        start_live_unmuted_phone: true,
      }).cameras,
    ).toMatchObject([
      {
        entity_id: "camera.front",
        low_latency_hls: false,
        start_live_unmuted_phone: true,
      },
    ]);
  });

  it("migrates short-lived per-camera appearance to the camera module", () => {
    const config = normalizeCardConfig({
      cameras: [
        {
          entity_id: "camera.front",
          camera_rounded_corners: false,
          camera_shadows: false,
        },
      ],
    });

    expect(config.camera_rounded_corners).toBe(false);
    expect(config.camera_shadows).toBe(false);
    expect(config.cameras[0]).not.toHaveProperty("camera_rounded_corners");
    expect(config.cameras[0]).not.toHaveProperty("camera_shadows");
  });

  it("rejects invalid, duplicate, and excessive camera configuration", () => {
    expect(() => normalizeCardConfig({ mobile_data_saving: "yes" })).toThrow(
      "mobile_data_saving must be a boolean",
    );
    expect(() => normalizeCardConfig({ outer_shadows: "yes" })).toThrow(
      "outer_shadows must be a boolean",
    );
    expect(() => normalizeCardConfig({ camera_bar_shadows: "yes" })).toThrow(
      "camera_bar_shadows must be a boolean",
    );
    expect(() =>
      normalizeCardConfig({
        cameras: [{ entity_id: "camera.front", camera_shadows: "yes" }],
      }),
    ).toThrow("camera_shadows must be a boolean");
    expect(() =>
      normalizeCardConfig({
        cameras: [{ entity_id: "camera.front" }, { entity_id: "camera.front" }],
      }),
    ).toThrow("WatchZone camera entities must be unique");
    expect(() =>
      normalizeCardConfig({
        cameras: Array.from({ length: MAX_CAMERAS + 1 }, (_, index) => ({
          entity_id: `camera.${index}`,
        })),
      }),
    ).toThrow(`WatchZone supports at most ${MAX_CAMERAS} cameras`);
  });
});
