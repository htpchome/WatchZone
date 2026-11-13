import type { CameraConfig, CardConfig } from "./config";
import {
  CARD_TYPE,
  DEFAULT_CARD_TITLE,
  DEFAULT_EVENT_HISTORY_DAYS,
} from "./constants";

export interface YamlCardConfig {
  readonly type: typeof CARD_TYPE;
  readonly [key: string]: unknown;
}

/** Removes known defaults before configuration is handed back to HA/YAML. */
export function toYamlCardConfig(config: CardConfig): YamlCardConfig {
  const yaml: Record<string, unknown> = { ...config, type: CARD_TYPE };
  if (config.title === DEFAULT_CARD_TITLE) delete yaml.title;
  if (config.rounded_outer_corners !== false) {
    delete yaml.rounded_outer_corners;
  }
  if (config.outer_shadows !== false) delete yaml.outer_shadows;
  if (config.outer_padding !== false) delete yaml.outer_padding;
  if (config.camera_rounded_corners !== false) {
    delete yaml.camera_rounded_corners;
  }
  if (config.camera_shadows !== false) delete yaml.camera_shadows;
  if (!config.camera_switcher_overlay) delete yaml.camera_switcher_overlay;
  if (config.camera_bar_rounded_corners !== false) {
    delete yaml.camera_bar_rounded_corners;
  }
  if (config.camera_bar_shadows !== false) delete yaml.camera_bar_shadows;
  if (config.display_event_type_badges !== false) {
    delete yaml.display_event_type_badges;
  }
  if (config.display_object_badges !== false) {
    delete yaml.display_object_badges;
  }
  if (config.display_zone !== false) delete yaml.display_zone;
  if (config.event_rounded_corners !== false) {
    delete yaml.event_rounded_corners;
  }
  if (config.event_shadows !== false) delete yaml.event_shadows;
  if (config.event_history_days === DEFAULT_EVENT_HISTORY_DAYS) {
    delete yaml.event_history_days;
  }
  if (config.highlight_camera_on_activity !== false) {
    delete yaml.highlight_camera_on_activity;
  }
  if (config.alert_detection_takeover === "both") {
    delete yaml.alert_detection_takeover;
  }
  if (!config.start_alert_takeover_on) delete yaml.start_alert_takeover_on;
  if (config.ptz_overlay_control === "start_open") {
    delete yaml.ptz_overlay_control;
  }
  if (config.slide_transition === "slide") delete yaml.slide_transition;
  if (config.view_timelapse_on_thumbnail_hover !== false) {
    delete yaml.view_timelapse_on_thumbnail_hover;
  }
  if (!config.mobile_data_saving) delete yaml.mobile_data_saving;
  if (config.cameras.length === 0) delete yaml.cameras;
  else yaml.cameras = config.cameras.map(compactCameraConfig);
  for (const [key, value] of Object.entries(yaml)) {
    if (value === undefined) delete yaml[key];
  }
  return yaml as YamlCardConfig;
}

function compactCameraConfig(camera: CameraConfig): Record<string, unknown> {
  const compact: Record<string, unknown> = { entity_id: camera.entity_id };
  if (camera.additional_camera) {
    compact.additional_camera = { ...camera.additional_camera };
  }
  if (camera.connection !== "home_assistant") {
    compact.connection = camera.connection;
  }
  if (camera.frigate_fallback !== "mse") {
    compact.frigate_fallback = camera.frigate_fallback;
  }
  if (camera.group_name) compact.group_name = camera.group_name;
  if (camera.lights.length) {
    compact.lights = camera.lights.map((light) => ({
      entity_id: light.entity_id,
      ...(light.icon ? { icon: light.icon } : {}),
    }));
  }
  if (!camera.low_latency_hls) compact.low_latency_hls = false;
  if (camera.ptz_enabled) compact.ptz_enabled = true;
  if (camera.start_live_unmuted_pc_tablet)
    compact.start_live_unmuted_pc_tablet = true;
  if (camera.start_live_unmuted_phone) compact.start_live_unmuted_phone = true;
  if (camera.title) compact.title = camera.title;
  if (camera.two_way_talk_enabled) compact.two_way_talk_enabled = true;
  return compact;
}
