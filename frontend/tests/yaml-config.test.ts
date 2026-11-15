import { describe, expect, it } from "vitest";

import { normalizeCardConfig } from "../src/core/config";
import { CARD_TYPE, DEFAULT_CARD_TITLE } from "../src/core/constants";
import { toYamlCardConfig } from "../src/core/yaml-config";

describe("WatchZone YAML configuration manager", () => {
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
    ).toMatchObject({
      stage_flow: {
        default: ["standard-camera-stage", "future-camera-stage"],
        phone: ["standard-camera-stage"],
      },
      stage_type: "camera_only",
    });
    expect(
      toYamlCardConfig(
        normalizeCardConfig({
          stage_type: "minimal_camera_only",
          type: CARD_TYPE,
        }),
      ),
    ).toEqual({ stage_type: "minimal_camera_only", type: CARD_TYPE });
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
          event_history_days: 12,
          event_shadows: false,
          alert_detection_takeover: "alerts",
          highlight_camera_on_activity: false,
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
      event_history_days: 12,
      event_shadows: false,
      alert_detection_takeover: "alerts",
      highlight_camera_on_activity: false,
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
