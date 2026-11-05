import { CAMERA_MODULE_TYPE, CAMERA_TAG } from "../../core/constants";
import { cameraImageUrl } from "../../core/home-assistant";
import { englishLocalize } from "../../core/localization";
import type { MediaRetentionPreference } from "../../core/media-retention-policy";
import type {
  ModuleDefinition,
  PlaceableRuntimeContext,
} from "../../core/placeable";
import { LiveSourceResolver } from "../../providers/live-source-resolver";
import type {
  CameraItemConfig,
  CameraModule,
  CameraShadowStyle,
} from "./camera";

export interface CameraModuleConfig {
  readonly cameras: readonly Omit<
    CameraItemConfig,
    "available" | "posterUrl"
  >[];
  readonly retentionPreference: MediaRetentionPreference;
  readonly roundedCorners: boolean;
  readonly shadowStyle: CameraShadowStyle;
}

const resolver = new LiveSourceResolver();
let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<CameraModuleConfig> = {
  type: CAMERA_MODULE_TYPE,
  validateConfig: validateCameraConfig,
  getEntityIds: ({ cameras }) => cameras.map(({ entityId }) => entityId),
  async prepare(config, context) {
    const first = config.cameras[0];
    if (!first || !context.api || !context.hass?.states[first.entityId])
      return undefined;
    const lease = await resolver.acquireHomeAssistantWebRtc(
      context.api,
      first.entityId,
    );
    return { release: () => lease.release() };
  },
  define() {
    return (definitionPromise ??= import("./camera").then(() => undefined));
  },
  createElement() {
    return document.createElement(CAMERA_TAG);
  },
  updateElement(element, config, context) {
    updateCameraElement(element as CameraModule, config, context);
  },
};

function updateCameraElement(
  camera: CameraModule,
  config: CameraModuleConfig,
  context: PlaceableRuntimeContext,
): void {
  camera.api = context.api;
  camera.cameraSession = context.cameraSession;
  camera.localize = context.localize ?? englishLocalize;
  camera.retentionPreference = config.retentionPreference;
  camera.roundedCorners = config.roundedCorners;
  camera.shadowStyle = config.shadowStyle;
  camera.cameras = config.cameras.map((item) => ({
    ...item,
    available: Boolean(context.hass?.states[item.entityId]),
    posterUrl: cameraImageUrl(context.hass, item.entityId),
  }));
}

function validateCameraConfig(value: unknown): CameraModuleConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("Camera module configuration must be an object.");
  }
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.cameras) || source.cameras.length === 0)
    throw new Error("Camera modules require at least one camera.");
  const cameras = source.cameras.map((camera, index) =>
    validateCameraItem(camera, index),
  );
  if (
    source.retentionPreference !== "automatic" &&
    source.retentionPreference !== "reduced_bandwidth"
  ) {
    throw new Error("Camera modules require a valid retention preference.");
  }
  if (typeof source.roundedCorners !== "boolean") {
    throw new Error("Camera module roundedCorners must be a boolean.");
  }
  if (
    source.shadowStyle !== "medium" &&
    source.shadowStyle !== "small" &&
    source.shadowStyle !== "none"
  ) {
    throw new Error("Camera module shadowStyle is invalid.");
  }
  return {
    cameras,
    retentionPreference: source.retentionPreference,
    roundedCorners: source.roundedCorners,
    shadowStyle: source.shadowStyle,
  };
}

function validateCameraItem(
  value: unknown,
  index: number,
): Omit<CameraItemConfig, "available" | "posterUrl"> {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Camera module item ${index + 1} must be an object.`);
  }
  const source = value as Record<string, unknown>;
  if (
    typeof source.entityId !== "string" ||
    !source.entityId.startsWith("camera.")
  )
    throw new Error("Camera modules require camera entity IDs.");
  for (const key of [
    "lowLatencyHls",
    "startUnmutedPcTablet",
    "startUnmutedPhone",
  ] as const) {
    if (typeof source[key] !== "boolean") {
      throw new Error(`Camera module ${key} must be a boolean.`);
    }
  }
  return {
    entityId: source.entityId,
    lowLatencyHls: source.lowLatencyHls as boolean,
    startUnmutedPcTablet: source.startUnmutedPcTablet as boolean,
    startUnmutedPhone: source.startUnmutedPhone as boolean,
  } as Omit<CameraItemConfig, "available" | "posterUrl">;
}

export type { CameraModule, CameraShadowStyle } from "./camera";
