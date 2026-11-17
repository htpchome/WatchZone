import type { CardConfig } from "../core/config";

/** Projects device-specific appearance onto the stable presentation fields. */
export function activeDeviceAppearanceConfig(
  config: CardConfig,
  isPhone: boolean,
): CardConfig {
  if (!isPhone) return config;
  return {
    ...config,
    camera_bar_rounded_corners: config.camera_bar_rounded_corners_phone,
    camera_bar_shadows: config.camera_bar_shadows_phone,
    camera_rounded_corners: config.camera_rounded_corners_phone,
    camera_shadows: config.camera_shadows_phone,
    event_rounded_corners: config.event_rounded_corners_phone,
    event_shadows: config.event_shadows_phone,
    outer_padding: config.outer_padding_phone,
    outer_shadows: config.outer_shadows_phone,
    rounded_outer_corners: config.rounded_outer_corners_phone,
  };
}
