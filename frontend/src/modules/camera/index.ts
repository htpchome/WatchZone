import { CAMERA_MODULE_TYPE, CAMERA_TAG } from "../../core/constants";
import { cameraImageUrl } from "../../core/home-assistant";
import type { ModuleDefinition, ModuleRuntimeContext } from "../../core/module";
import { LiveSourceResolver } from "../../providers/live-source-resolver";
import type { CameraModule, CameraShadowStyle } from "./camera";

export interface CameraModuleConfig {
  readonly entityId: string;
  readonly lowLatencyHls: boolean;
  readonly roundedCorners: boolean;
  readonly shadowStyle: CameraShadowStyle;
  readonly startUnmutedPcTablet: boolean;
  readonly startUnmutedPhone: boolean;
}

const resolver = new LiveSourceResolver();
let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<CameraModuleConfig> = {
  type: CAMERA_MODULE_TYPE,
  validateConfig: validateCameraConfig,
  getEntityIds: ({ entityId }) => [entityId],
  async prepare(config, context) {
    if (!context.api || !context.hass?.states[config.entityId])
      return undefined;
    const lease = await resolver.acquireHomeAssistantWebRtc(
      context.api,
      config.entityId,
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
  context: ModuleRuntimeContext,
): void {
  camera.api = context.api;
  camera.available = Boolean(context.hass?.states[config.entityId]);
  camera.entityId = config.entityId;
  camera.lowLatencyHls = config.lowLatencyHls;
  camera.posterUrl = cameraImageUrl(context.hass, config.entityId);
  camera.roundedCorners = config.roundedCorners;
  camera.shadowStyle = config.shadowStyle;
  camera.startUnmutedPcTablet = config.startUnmutedPcTablet;
  camera.startUnmutedPhone = config.startUnmutedPhone;
}

function validateCameraConfig(value: unknown): CameraModuleConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("Camera module configuration must be an object.");
  }
  const source = value as Record<string, unknown>;
  if (
    typeof source.entityId !== "string" ||
    !source.entityId.startsWith("camera.")
  ) {
    throw new Error("Camera modules require a camera entity ID.");
  }
  for (const key of [
    "lowLatencyHls",
    "roundedCorners",
    "startUnmutedPcTablet",
    "startUnmutedPhone",
  ] as const) {
    if (typeof source[key] !== "boolean") {
      throw new Error(`Camera module ${key} must be a boolean.`);
    }
  }
  if (
    source.shadowStyle !== "medium" &&
    source.shadowStyle !== "small" &&
    source.shadowStyle !== "none"
  ) {
    throw new Error("Camera module shadowStyle is invalid.");
  }
  return {
    entityId: source.entityId,
    lowLatencyHls: source.lowLatencyHls as boolean,
    roundedCorners: source.roundedCorners as boolean,
    shadowStyle: source.shadowStyle,
    startUnmutedPcTablet: source.startUnmutedPcTablet as boolean,
    startUnmutedPhone: source.startUnmutedPhone as boolean,
  };
}

export type { CameraModule, CameraShadowStyle } from "./camera";
