import {
  APP_NAME,
  CARD_TYPE,
  DEFAULT_CARD_TITLE,
  MAX_CAMERA_TITLE_LENGTH,
  MAX_CAMERAS,
  DEFAULT_EVENT_HISTORY_DAYS,
  MAX_EVENT_HISTORY_DAYS,
  MIN_EVENT_HISTORY_DAYS,
  MAX_LIGHTS_PER_CAMERA,
} from "./constants";

export interface LinkedLightConfig {
  readonly entity_id: string;
  readonly icon?: string;
}

export type LiveConnectionType = "home_assistant" | "frigate_go2rtc";
export type FrigateFallbackTransport = "hls" | "mse";

export interface CameraConfig {
  readonly connection: LiveConnectionType;
  readonly entity_id: string;
  readonly frigate_fallback: FrigateFallbackTransport;
  readonly lights: readonly LinkedLightConfig[];
  readonly low_latency_hls: boolean;
  readonly ptz_enabled: boolean;
  readonly start_live_unmuted_pc_tablet: boolean;
  readonly start_live_unmuted_phone: boolean;
  readonly title: string;
  readonly two_way_talk_enabled: boolean;
}

export interface CardConfig {
  readonly camera_bar_shadows: boolean;
  readonly camera_rounded_corners: boolean;
  readonly camera_shadows: boolean;
  readonly display_event_type_badges: boolean;
  readonly display_object_badges: boolean;
  readonly display_zone: boolean;
  readonly event_rounded_corners: boolean;
  readonly event_history_days: number;
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
    "camera_bar_shadows",
    "camera_rounded_corners",
    "camera_shadows",
    "display_event_type_badges",
    "display_object_badges",
    "display_zone",
    "event_rounded_corners",
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
  const eventHistoryDays = source.event_history_days;
  if (
    eventHistoryDays !== undefined &&
    (typeof eventHistoryDays !== "number" ||
      !Number.isInteger(eventHistoryDays) ||
      eventHistoryDays < MIN_EVENT_HISTORY_DAYS ||
      eventHistoryDays > MAX_EVENT_HISTORY_DAYS)
  ) {
    throw new Error(
      `${APP_NAME} event_history_days must be an integer from ${MIN_EVENT_HISTORY_DAYS} to ${MAX_EVENT_HISTORY_DAYS}.`,
    );
  }
  const normalized: Record<string, unknown> = {
    ...source,
    cameras,
    type: CARD_TYPE,
    title: title.trim(),
  };
  for (const legacyKey of [
    "camera_entity",
    "low_latency_hls",
    "start_live_unmuted_pc_tablet",
    "start_live_unmuted_phone",
  ]) {
    delete normalized[legacyKey];
  }
  normalized.camera_rounded_corners = moduleAppearanceValue(
    source,
    "camera_rounded_corners",
  );
  normalized.camera_shadows = moduleAppearanceValue(source, "camera_shadows");
  normalized.camera_bar_shadows = source.camera_bar_shadows !== false;
  normalized.display_event_type_badges =
    source.display_event_type_badges !== false;
  normalized.display_object_badges = source.display_object_badges !== false;
  normalized.display_zone = source.display_zone !== false;
  normalized.event_rounded_corners = source.event_rounded_corners !== false;
  normalized.event_history_days =
    typeof eventHistoryDays === "number"
      ? eventHistoryDays
      : DEFAULT_EVENT_HISTORY_DAYS;
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
    connection: "home_assistant",
    entity_id: entityId,
    frigate_fallback: "mse",
    lights: [],
    low_latency_hls: true,
    ptz_enabled: false,
    start_live_unmuted_pc_tablet: false,
    start_live_unmuted_phone: false,
    title: "",
    two_way_talk_enabled: false,
  };
}

/** Keeps camera labels safe for plain-text presentation while supporting locales. */
export function sanitizeCameraTitleInput(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/ {2,}/g, " ")
    .trimStart()
    .slice(0, MAX_CAMERA_TITLE_LENGTH);
}

export function normalizeCameraTitle(value: string): string {
  return sanitizeCameraTitleInput(value).trimEnd();
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
      entity_id: source.camera_entity,
      low_latency_hls: source.low_latency_hls,
      ptz_enabled: source.ptz_enabled,
      start_live_unmuted_pc_tablet: source.start_live_unmuted_pc_tablet,
      start_live_unmuted_phone: source.start_live_unmuted_phone,
      two_way_talk_enabled: source.two_way_talk_enabled,
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
  if (
    "frigate_fallback" in source &&
    source.frigate_fallback !== undefined &&
    source.frigate_fallback !== "mse" &&
    source.frigate_fallback !== "hls"
  ) {
    throw new Error(
      `${APP_NAME} camera ${index + 1} Frigate fallback must be mse or hls.`,
    );
  }
  const defaults = createDefaultCameraConfig(source.entity_id.trim());
  const lights = normalizeLights(source, index);
  if (
    "connection" in source &&
    source.connection !== undefined &&
    source.connection !== "home_assistant" &&
    source.connection !== "frigate_go2rtc"
  ) {
    throw new Error(
      `${APP_NAME} camera ${index + 1} connection must be a supported connection type.`,
    );
  }
  for (const key of [
    "low_latency_hls",
    "ptz_enabled",
    "start_live_unmuted_pc_tablet",
    "start_live_unmuted_phone",
    "two_way_talk_enabled",
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
  if (
    "title" in source &&
    source.title !== undefined &&
    typeof source.title !== "string"
  ) {
    throw new Error(`${APP_NAME} camera ${index + 1} title must be a string.`);
  }
  return {
    connection:
      source.connection === "frigate_go2rtc"
        ? "frigate_go2rtc"
        : defaults.connection,
    entity_id: defaults.entity_id,
    frigate_fallback:
      source.frigate_fallback === "hls" ? "hls" : defaults.frigate_fallback,
    lights,
    low_latency_hls:
      typeof source.low_latency_hls === "boolean"
        ? source.low_latency_hls
        : defaults.low_latency_hls,
    ptz_enabled: source.ptz_enabled === true,
    start_live_unmuted_pc_tablet: source.start_live_unmuted_pc_tablet === true,
    start_live_unmuted_phone: source.start_live_unmuted_phone === true,
    title:
      typeof source.title === "string"
        ? normalizeCameraTitle(source.title)
        : defaults.title,
    two_way_talk_enabled: source.two_way_talk_enabled === true,
  };
}

function normalizeLights(
  source: Readonly<Record<string, unknown>>,
  cameraIndex: number,
): readonly LinkedLightConfig[] {
  const values =
    source.lights ??
    (Array.isArray(source.light_entity_ids)
      ? source.light_entity_ids.map((entity_id) => ({ entity_id }))
      : source.light_entity_ids);
  if (values === undefined) return [];
  if (!Array.isArray(values)) {
    throw new Error(
      `${APP_NAME} camera ${cameraIndex + 1} lights must be an array.`,
    );
  }
  if (values.length > MAX_LIGHTS_PER_CAMERA) {
    throw new Error(
      `${APP_NAME} camera ${cameraIndex + 1} supports at most ${MAX_LIGHTS_PER_CAMERA} lights.`,
    );
  }
  const lights = values.map((value) => {
    if (typeof value !== "object" || value === null) {
      throw new Error(
        `${APP_NAME} camera ${cameraIndex + 1} must use light entities.`,
      );
    }
    const light = value as Record<string, unknown>;
    if (
      typeof light.entity_id !== "string" ||
      !light.entity_id.trim().startsWith("light.")
    ) {
      throw new Error(
        `${APP_NAME} camera ${cameraIndex + 1} must use light entities.`,
      );
    }
    if (
      light.icon !== undefined &&
      (typeof light.icon !== "string" || !isIconName(light.icon.trim()))
    ) {
      throw new Error(
        `${APP_NAME} camera ${cameraIndex + 1} light icon is invalid.`,
      );
    }
    return {
      entity_id: light.entity_id.trim(),
      ...(typeof light.icon === "string" && light.icon.trim()
        ? { icon: light.icon.trim() }
        : {}),
    };
  });
  const ids = lights.map(({ entity_id }) => entity_id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      `${APP_NAME} camera ${cameraIndex + 1} light entities must be unique.`,
    );
  }
  return lights;
}

function isIconName(value: string): boolean {
  return value.length <= 128 && /^[a-z0-9_-]+:[a-z0-9-]+$/i.test(value);
}

type CameraAppearanceKey = "camera_rounded_corners" | "camera_shadows";

/** One-way migration from the short-lived per-camera appearance shape. */
function moduleAppearanceValue(
  source: Readonly<Record<string, unknown>>,
  key: CameraAppearanceKey,
): boolean {
  if (typeof source[key] === "boolean") return source[key];
  const firstCamera = Array.isArray(source.cameras) ? source.cameras[0] : null;
  if (typeof firstCamera !== "object" || firstCamera === null) return true;
  const legacyValue = (firstCamera as Record<string, unknown>)[key];
  if (legacyValue === undefined) return true;
  if (typeof legacyValue !== "boolean") {
    throw new Error(`${APP_NAME} ${key} must be a boolean.`);
  }
  return legacyValue;
}

export function cardConfigSignature(config: CardConfig): string {
  return JSON.stringify(config);
}
