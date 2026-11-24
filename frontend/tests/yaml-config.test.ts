import { describe, expect, it } from "vitest";

import { normalizeCardConfig } from "../src/core/config";
import { CARD_TYPE, DEFAULT_CARD_TITLE } from "../src/core/constants";
import { toYamlCardConfig } from "../src/core/yaml-config";

describe("CameraOptics YAML configuration manager", () => {
  it("persists a Frigate live-only stream selection", () => {
    expect(
      toYamlCardConfig(
        normalizeCardConfig({
          type: CARD_TYPE,
          cameras: [
            {
              entity_id: "camera.front",
              connection: "frigate_go2rtc",
              frigate_stream: "front_sub",
            },
          ],
        }),
      ).cameras,
    ).toEqual([
      {
        entity_id: "camera.front",
        connection: "frigate_go2rtc",
        frigate_stream: "front_sub",
      },
    ]);
  });
  it("omits known defaults", () => {
    expect(
      toYamlCardConfig(
        normalizeCardConfig({
          type: CARD_TYPE,
          title: DEFAULT_CARD_TITLE,
        }),
      ),
    ).toEqual({ type: CARD_TYPE });
  });

  it("persists only a non-default recorded media player type", () => {
    expect(
      toYamlCardConfig(
        normalizeCardConfig({
          recorded_media_player_type: "bottom_drawer",
          type: CARD_TYPE,
        }),
      ),
    ).toEqual({
      recorded_media_player_type: "bottom_drawer",
      type: CARD_TYPE,
    });
  });

  it("persists only the theme video-background opt-in", () => {
    expect(
      toYamlCardConfig(
        normalizeCardConfig({
          type: CARD_TYPE,
          use_theme_video_background: true,
        }),
      ),
    ).toEqual({
      type: CARD_TYPE,
      use_theme_video_background: true,
    });
  });

  it("persists the stage gate while omitting that type's default lineup", () => {
    expect(
      toYamlCardConfig(
        normalizeCardConfig({
          stage_type: "camera_only",
          type: CARD_TYPE,
        }),
      ),
    ).toEqual({ stage_type: "camera_only", type: CARD_TYPE });
    expect(
      toYamlCardConfig(
        normalizeCardConfig({
          stage_flow: {
            default: ["standard-camera-stage", "future-camera-stage"],
            phone: ["standard-camera-stage"],
          },
          stage_type: "camera_only",
          type: CARD_TYPE,
        }),
      ),
    ).toEqual({ stage_type: "camera_only", type: CARD_TYPE });
    expect(
      toYamlCardConfig(
        normalizeCardConfig({
          stage_type: "minimal_camera_only",
          type: CARD_TYPE,
        }),
      ),
    ).toEqual({ stage_type: "minimal_camera_only", type: CARD_TYPE });
  });

  it("persists only non-default device height modes", () => {
    expect(
      toYamlCardConfig(
        normalizeCardConfig({
          card_height_mode: "fit_viewport",
          card_height_mode_phone: "fill_container",
          type: CARD_TYPE,
        }),
      ),
    ).toEqual({
      card_height_mode: "fit_viewport",
      card_height_mode_phone: "fill_container",
      type: CARD_TYPE,
    });
  });

  it("persists only non-default physical-phone appearance", () => {
    expect(
      toYamlCardConfig(
        normalizeCardConfig({
          camera_bar_rounded_corners_phone: false,
          camera_bar_shadows_phone: false,
          camera_rounded_corners_phone: true,
          camera_shadows_phone: true,
          edge_to_edge_phone: false,
          event_rounded_corners_phone: false,
          event_shadows_phone: false,
          outer_padding_phone: true,
          outer_shadows_phone: true,
          rounded_outer_corners_phone: true,
          type: CARD_TYPE,
        }),
      ),
    ).toEqual({
      camera_bar_rounded_corners_phone: false,
      camera_bar_shadows_phone: false,
      camera_rounded_corners_phone: true,
      camera_shadows_phone: true,
      edge_to_edge_phone: false,
      event_rounded_corners_phone: false,
      event_shadows_phone: false,
      outer_padding_phone: true,
      outer_shadows_phone: true,
      rounded_outer_corners_phone: true,
      type: CARD_TYPE,
    });
  });

  it("keeps non-default values and unknown HA configuration", () => {
    expect(
      toYamlCardConfig(
        normalizeCardConfig({
          type: CARD_TYPE,
          title: "Front",
          camera_bar_rounded_corners: false,
          camera_bar_shadows: false,
          camera_rounded_corners: false,
          camera_shadows: false,
          camera_switcher_overlay: true,
          display_event_type_badges: false,
          display_object_badges: false,
          display_zone: false,
          edge_to_edge_phone: false,
          event_history_days: 12,
          event_shadows: false,
          alert_detection_takeover: "alerts",
          alert_detection_highlight: "off",
          alert_detection_thumbnail_outline: "alerts",
          minimal_camera_show_fullscreen_button: false,
          minimal_camera_show_mute_button: false,
          minimal_camera_show_pip_button: false,
          minimal_camera_show_source_label: false,
          start_alert_takeover_on: true,
          view_timelapse_on_thumbnail_hover: false,
          cameras: [
            {
              connection: "frigate_go2rtc",
              entity_id: "camera.front",
              frigate_fallback: "hls",
              lights: [
                { entity_id: "light.porch", icon: "mdi:coach-lamp" },
                { entity_id: "light.driveway" },
              ],
              low_latency_hls: false,
              ptz_enabled: true,
              start_live_unmuted_pc_tablet: true,
              start_live_unmuted_phone: true,
              title: "Front Door",
              two_way_talk_enabled: true,
            },
          ],
          rounded_outer_corners: false,
          outer_shadows: false,
          outer_padding: false,
          ptz_overlay_control: "start_closed",
          slide_transition: "fade",
          slide_advance_time: 20,
          mobile_data_saving: true,
          grid_options: { columns: 8 },
        }),
      ),
    ).toEqual({
      type: CARD_TYPE,
      title: "Front",
      camera_bar_rounded_corners: false,
      camera_bar_shadows: false,
      camera_rounded_corners: false,
      camera_shadows: false,
      camera_switcher_overlay: true,
      display_event_type_badges: false,
      display_object_badges: false,
      display_zone: false,
      edge_to_edge_phone: false,
      event_history_days: 12,
      event_shadows: false,
      alert_detection_takeover: "alerts",
      alert_detection_highlight: "off",
      alert_detection_thumbnail_outline: "alerts",
      minimal_camera_show_fullscreen_button: false,
      minimal_camera_show_mute_button: false,
      minimal_camera_show_pip_button: false,
      minimal_camera_show_source_label: false,
      start_alert_takeover_on: true,
      view_timelapse_on_thumbnail_hover: false,
      cameras: [
        {
          connection: "frigate_go2rtc",
          entity_id: "camera.front",
          frigate_fallback: "hls",
          lights: [
            { entity_id: "light.porch", icon: "mdi:coach-lamp" },
            { entity_id: "light.driveway" },
          ],
          low_latency_hls: false,
          ptz_enabled: true,
          start_live_unmuted_pc_tablet: true,
          start_live_unmuted_phone: true,
          title: "Front Door",
          two_way_talk_enabled: true,
        },
      ],
      rounded_outer_corners: false,
      outer_shadows: false,
      outer_padding: false,
      ptz_overlay_control: "start_closed",
      slide_transition: "fade",
      slide_advance_time: 20,
      mobile_data_saving: true,
      grid_options: { columns: 8 },
    });
  });
});
