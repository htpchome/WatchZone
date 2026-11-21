import type { CameraConfig, CardConfig } from "./config";
import {
  CARD_TYPE,
  DEFAULT_CARD_TITLE,
  DEFAULT_EVENT_HISTORY_DAYS,
  DEFAULT_SLIDE_ADVANCE_SECONDS,
} from "./constants";
import { defaultStageFlow, stageFlowsEqual } from "./stage";

export interface YamlCardConfig {
  readonly type: typeof CARD_TYPE;
  readonly [key: string]: unknown;
}

/** Removes known defaults before configuration is handed back to HA/YAML. */
export function toYamlCardConfig(config: CardConfig): YamlCardConfig {
  const yaml: Record<string, unknown> = { ...config, type: CARD_TYPE };
  if (config.title === DEFAULT_CARD_TITLE) delete yaml.title;
  if (config.card_height_mode === "auto") delete yaml.card_height_mode;
  if (config.card_height_mode_phone === "auto") {
    delete yaml.card_height_mode_phone;
  }
  if (config.rounded_outer_corners !== false) {
    delete yaml.rounded_outer_corners;
  }
  if (!config.rounded_outer_corners_phone) {
    delete yaml.rounded_outer_corners_phone;
  }
  if (config.outer_shadows !== false) delete yaml.outer_shadows;
  if (!config.outer_shadows_phone) delete yaml.outer_shadows_phone;
  if (config.outer_padding !== false) delete yaml.outer_padding;
  if (!config.outer_padding_phone) delete yaml.outer_padding_phone;
  if (config.camera_rounded_corners !== false) {
    delete yaml.camera_rounded_corners;
  }
  if (!config.camera_rounded_corners_phone) {
    delete yaml.camera_rounded_corners_phone;
  }
  if (config.camera_shadows !== false) delete yaml.camera_shadows;
  if (!config.camera_shadows_phone) delete yaml.camera_shadows_phone;
  if (!config.camera_switcher_overlay) delete yaml.camera_switcher_overlay;
  if (config.companion_rotate_action === "double_column") {
    delete yaml.companion_rotate_action;
  }
  if (config.camera_bar_rounded_corners !== false) {
    delete yaml.camera_bar_rounded_corners;
  }
  if (config.camera_bar_rounded_corners_phone !== false) {
    delete yaml.camera_bar_rounded_corners_phone;
  }
  if (config.camera_bar_shadows !== false) delete yaml.camera_bar_shadows;
  if (config.camera_bar_shadows_phone !== false) {
    delete yaml.camera_bar_shadows_phone;
  }
  if (config.display_event_type_badges !== false) {
    delete yaml.display_event_type_badges;
  }
  if (config.display_object_badges !== false) {
    delete yaml.display_object_badges;
  }
  if (config.display_zone !== false) delete yaml.display_zone;
  if (config.edge_to_edge_phone) delete yaml.edge_to_edge_phone;
  if (config.event_rounded_corners !== false) {
    delete yaml.event_rounded_corners;
  }
  if (config.event_rounded_corners_phone !== false) {
    delete yaml.event_rounded_corners_phone;
  }
  if (config.event_shadows !== false) delete yaml.event_shadows;
  if (config.event_shadows_phone !== false) {
    delete yaml.event_shadows_phone;
  }
  if (config.event_history_days === DEFAULT_EVENT_HISTORY_DAYS) {
    delete yaml.event_history_days;
  }
  if (config.alert_detection_highlight === "both") {
    delete yaml.alert_detection_highlight;
  }
  if (config.alert_detection_thumbnail_outline === "both") {
    delete yaml.alert_detection_thumbnail_outline;
  }
  if (config.minimal_camera_show_fullscreen_button !== false) {
    delete yaml.minimal_camera_show_fullscreen_button;
  }
  if (config.minimal_camera_menu_position === "top_left") {
    delete yaml.minimal_camera_menu_position;
  }
  if (config.minimal_camera_show_mute_button !== false) {
    delete yaml.minimal_camera_show_mute_button;
  }
  if (config.minimal_camera_show_pip_button !== false) {
    delete yaml.minimal_camera_show_pip_button;
  }
  if (config.minimal_camera_show_source_label !== false) {
    delete yaml.minimal_camera_show_source_label;
  }
  if (config.alert_detection_takeover === "both") {
    delete yaml.alert_detection_takeover;
  }
  if (!config.start_alert_takeover_on) delete yaml.start_alert_takeover_on;
  if (config.ptz_overlay_control === "start_open") {
    delete yaml.ptz_overlay_control;
  }
  if (config.recorded_media_player_type === "draggable") {
    delete yaml.recorded_media_player_type;
  }
  if (config.slide_transition === "slide") delete yaml.slide_transition;
  if (config.slide_advance_time === DEFAULT_SLIDE_ADVANCE_SECONDS) {
    delete yaml.slide_advance_time;
  }
  if (config.view_timelapse_on_thumbnail_hover !== false) {
    delete yaml.view_timelapse_on_thumbnail_hover;
  }
  if (!config.mobile_data_saving) delete yaml.mobile_data_saving;
  if (config.stage_type === "full") delete yaml.stage_type;
  if (
    config.tap_action.action ===
      (config.stage_type === "minimal_camera_only"
        ? "open-live-view"
        : "more-info") &&
    Object.keys(config.tap_action).length === 1
  )
    delete yaml.tap_action;
  if (
    config.hold_action.action === "none" &&
    Object.keys(config.hold_action).length === 1
  )
    delete yaml.hold_action;
  if (
    config.double_tap_action.action === "none" &&
    Object.keys(config.double_tap_action).length === 1
  )
    delete yaml.double_tap_action;
  if (stageFlowsEqual(config.stage_flow, defaultStageFlow(config.stage_type))) {
    delete yaml.stage_flow;
  }
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
  if (camera.live_substream) {
    compact.live_substream = camera.live_substream;
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
