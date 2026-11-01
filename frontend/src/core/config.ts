import { CARD_TYPE, DEFAULT_CARD_TITLE } from "./constants";

export interface WatchZoneCardConfig {
  readonly camera_entity?: string;
  readonly camera_rounded_corners?: boolean;
  readonly camera_shadows?: boolean;
  readonly outer_padding?: boolean;
  readonly outer_shadows?: boolean;
  readonly rounded_outer_corners?: boolean;
  readonly start_live_unmuted_pc_tablet?: boolean;
  readonly start_live_unmuted_phone?: boolean;
  readonly type: typeof CARD_TYPE;
  readonly title: string;
  readonly [key: string]: unknown;
}

export function normalizeCardConfig(value: unknown): WatchZoneCardConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("WatchZone card configuration must be an object.");
  }
  const source = value as Record<string, unknown>;

  const title = "title" in source ? source.title : DEFAULT_CARD_TITLE;
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("WatchZone card title must be a non-empty string.");
  }

  const cameraEntity =
    "camera_entity" in source ? source.camera_entity : undefined;
  if (
    cameraEntity !== undefined &&
    (typeof cameraEntity !== "string" ||
      !cameraEntity.trim().startsWith("camera."))
  ) {
    throw new Error("WatchZone camera must be a camera entity ID.");
  }

  for (const key of [
    "rounded_outer_corners",
    "outer_shadows",
    "outer_padding",
    "camera_rounded_corners",
    "camera_shadows",
    "start_live_unmuted_pc_tablet",
    "start_live_unmuted_phone",
  ] as const) {
    if (key in source && typeof source[key] !== "boolean") {
      throw new Error(`WatchZone ${key} must be a boolean.`);
    }
  }

  const normalized: Record<string, unknown> = {
    ...source,
    ...(typeof cameraEntity === "string" && cameraEntity.trim()
      ? { camera_entity: cameraEntity.trim() }
      : {}),
    type: CARD_TYPE,
    title: title.trim(),
  };
  normalized.rounded_outer_corners =
    typeof source.rounded_outer_corners === "boolean"
      ? source.rounded_outer_corners
      : true;
  normalized.outer_shadows =
    typeof source.outer_shadows === "boolean" ? source.outer_shadows : true;
  normalized.outer_padding =
    typeof source.outer_padding === "boolean" ? source.outer_padding : true;
  normalized.camera_rounded_corners =
    typeof source.camera_rounded_corners === "boolean"
      ? source.camera_rounded_corners
      : true;
  normalized.camera_shadows =
    typeof source.camera_shadows === "boolean" ? source.camera_shadows : true;
  normalized.start_live_unmuted_pc_tablet =
    source.start_live_unmuted_pc_tablet === true;
  normalized.start_live_unmuted_phone =
    source.start_live_unmuted_phone === true;
  return normalized as WatchZoneCardConfig;
}

export function cardConfigSignature(config: WatchZoneCardConfig): string {
  return JSON.stringify(config);
}
