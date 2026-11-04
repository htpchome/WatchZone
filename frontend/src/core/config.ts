import {
  APP_NAME,
  CARD_TYPE,
  DEFAULT_CARD_TITLE,
  MAX_CAMERAS,
} from "./constants";

export interface CameraConfig {
  readonly camera_rounded_corners: boolean;
  readonly camera_shadows: boolean;
  readonly entity_id: string;
  readonly low_latency_hls: boolean;
  readonly start_live_unmuted_pc_tablet: boolean;
  readonly start_live_unmuted_phone: boolean;
}

export interface CardConfig {
  readonly cameras: readonly CameraConfig[];
  readonly mobile_data_saving?: boolean;
  readonly outer_padding?: boolean;
  readonly outer_shadows?: boolean;
  readonly rounded_outer_corners?: boolean;
  readonly type: typeof CARD_TYPE;
  readonly title: string;
  readonly [key: string]: unknown;
}

export function normalizeCardConfig(value: unknown): CardConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${APP_NAME} card configuration must be an object.`);
  }
  const source = value as Record<string, unknown>;

  const title = "title" in source ? source.title : DEFAULT_CARD_TITLE;
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error(`${APP_NAME} card title must be a non-empty string.`);
  }

  for (const key of [
    "rounded_outer_corners",
    "outer_shadows",
    "outer_padding",
    "mobile_data_saving",
  ] as const) {
    if (key in source && typeof source[key] !== "boolean") {
      throw new Error(`${APP_NAME} ${key} must be a boolean.`);
    }
  }

  const cameras = normalizeCameras(source);
  const normalized: Record<string, unknown> = {
    ...source,
    cameras,
    type: CARD_TYPE,
    title: title.trim(),
  };
  for (const legacyKey of [
    "camera_entity",
    "camera_rounded_corners",
    "camera_shadows",
    "low_latency_hls",
    "start_live_unmuted_pc_tablet",
    "start_live_unmuted_phone",
  ]) {
    delete normalized[legacyKey];
  }
  normalized.rounded_outer_corners =
    typeof source.rounded_outer_corners === "boolean"
      ? source.rounded_outer_corners
      : true;
  normalized.outer_shadows =
    typeof source.outer_shadows === "boolean" ? source.outer_shadows : true;
  normalized.outer_padding =
    typeof source.outer_padding === "boolean" ? source.outer_padding : true;
  normalized.mobile_data_saving =
    typeof source.mobile_data_saving === "boolean"
      ? source.mobile_data_saving
      : false;
  return normalized as CardConfig;
}

export function createDefaultCameraConfig(entityId = ""): CameraConfig {
  return {
    camera_rounded_corners: true,
    camera_shadows: true,
    entity_id: entityId,
    low_latency_hls: true,
    start_live_unmuted_pc_tablet: false,
    start_live_unmuted_phone: false,
  };
}

function normalizeCameras(
  source: Readonly<Record<string, unknown>>,
): readonly CameraConfig[] {
  const cameraValues = Array.isArray(source.cameras)
    ? source.cameras
    : legacyCamera(source);
  if (cameraValues.length > MAX_CAMERAS) {
    throw new Error(`${APP_NAME} supports at most ${MAX_CAMERAS} cameras.`);
  }
  const cameras = cameraValues.map((value, index) =>
    normalizeCameraConfig(value, index),
  );
  const entityIds = new Set<string>();
  for (const camera of cameras) {
    if (entityIds.has(camera.entity_id)) {
      throw new Error(`${APP_NAME} camera entities must be unique.`);
    }
    entityIds.add(camera.entity_id);
  }
  return cameras;
}

function legacyCamera(
  source: Readonly<Record<string, unknown>>,
): readonly unknown[] {
  if (!("camera_entity" in source) || source.camera_entity === undefined) {
    return [];
  }
  return [
    {
      camera_rounded_corners: source.camera_rounded_corners,
      camera_shadows: source.camera_shadows,
      entity_id: source.camera_entity,
      low_latency_hls: source.low_latency_hls,
      start_live_unmuted_pc_tablet: source.start_live_unmuted_pc_tablet,
      start_live_unmuted_phone: source.start_live_unmuted_phone,
    },
  ];
}

function normalizeCameraConfig(value: unknown, index: number): CameraConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${APP_NAME} camera ${index + 1} must be an object.`);
  }
  const source = value as Record<string, unknown>;
  if (
    typeof source.entity_id !== "string" ||
    !source.entity_id.trim().startsWith("camera.")
  ) {
    throw new Error(
      `${APP_NAME} camera ${index + 1} must use a camera entity.`,
    );
  }
  const defaults = createDefaultCameraConfig(source.entity_id.trim());
  for (const key of [
    "camera_rounded_corners",
    "camera_shadows",
    "low_latency_hls",
    "start_live_unmuted_pc_tablet",
    "start_live_unmuted_phone",
  ] as const) {
    if (
      key in source &&
      source[key] !== undefined &&
      typeof source[key] !== "boolean"
    ) {
      throw new Error(
        `${APP_NAME} camera ${index + 1} ${key} must be a boolean.`,
      );
    }
  }
  return {
    camera_rounded_corners:
      typeof source.camera_rounded_corners === "boolean"
        ? source.camera_rounded_corners
        : defaults.camera_rounded_corners,
    camera_shadows:
      typeof source.camera_shadows === "boolean"
        ? source.camera_shadows
        : defaults.camera_shadows,
    entity_id: defaults.entity_id,
    low_latency_hls:
      typeof source.low_latency_hls === "boolean"
        ? source.low_latency_hls
        : defaults.low_latency_hls,
    start_live_unmuted_pc_tablet: source.start_live_unmuted_pc_tablet === true,
    start_live_unmuted_phone: source.start_live_unmuted_phone === true,
  };
}

export function cardConfigSignature(config: CardConfig): string {
  return JSON.stringify(config);
}
