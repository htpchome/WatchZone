import type { CardConfig } from "./config";
import { CARD_TYPE, DEFAULT_CARD_TITLE } from "./constants";

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
  if (config.low_latency_hls !== false) delete yaml.low_latency_hls;
  if (config.start_live_unmuted_pc_tablet !== true) {
    delete yaml.start_live_unmuted_pc_tablet;
  }
  if (config.start_live_unmuted_phone !== true) {
    delete yaml.start_live_unmuted_phone;
  }
  for (const [key, value] of Object.entries(yaml)) {
    if (value === undefined) delete yaml[key];
  }
  return yaml as YamlCardConfig;
}
