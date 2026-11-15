import {
  MINIMAL_CAMERA_MODULE_TYPE,
  MINIMAL_CAMERA_TAG,
} from "../../../core/constants";
import { cameraImageUrl } from "../../../core/home-assistant";
import type {
  FrigateFallbackTransport,
  HomeAssistantActionConfig,
  LiveConnectionType,
} from "../../../core/config";
import type { ModuleDefinition } from "../../placeable";
import type { MinimalCameraModule } from "./minimal-camera";

export interface MinimalCameraModuleConfig {
  readonly camera: {
    readonly connection: LiveConnectionType;
    readonly entityId: string;
    readonly frigateFallback: FrigateFallbackTransport;
    readonly lowLatencyHls: boolean;
    readonly startUnmutedPcTablet: boolean;
    readonly startUnmutedPhone: boolean;
    readonly title: string;
  };
  readonly doubleTapAction: HomeAssistantActionConfig;
  readonly holdAction: HomeAssistantActionConfig;
  readonly tapAction: HomeAssistantActionConfig;
}

let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<MinimalCameraModuleConfig> = {
  contextKeys: [],
  type: MINIMAL_CAMERA_MODULE_TYPE,
  validateConfig: validateMinimalCameraConfig,
  getEntityIds: ({ camera }) => [camera.entityId],
  define() {
    return (definitionPromise ??= import("./minimal-camera").then(
      () => undefined,
    ));
  },
  createElement() {
    return document.createElement(MINIMAL_CAMERA_TAG);
  },
  updateElement(element, config, context) {
    const camera = element as MinimalCameraModule;
    camera.api = context.api;
    camera.hass = context.hass;
    if (context.localize) camera.localize = context.localize;
    camera.available = Boolean(context.hass?.states[config.camera.entityId]);
    camera.camera = {
      ...config.camera,
      posterUrl: cameraImageUrl(context.hass, config.camera.entityId),
    };
    camera.doubleTapAction = config.doubleTapAction;
    camera.holdAction = config.holdAction;
    camera.tapAction = config.tapAction;
  },
};

function validateMinimalCameraConfig(
  value: unknown,
): MinimalCameraModuleConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("Minimal camera configuration is required.");
  }
  const source = value as Partial<MinimalCameraModuleConfig>;
  if (
    typeof source.camera !== "object" ||
    source.camera === null ||
    typeof source.camera.entityId !== "string"
  ) {
    throw new Error("Minimal camera requires one camera entity.");
  }
  return value as MinimalCameraModuleConfig;
}
