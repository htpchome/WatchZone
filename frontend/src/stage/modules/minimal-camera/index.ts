import {
  MINIMAL_CAMERA_MODULE_TYPE,
  MINIMAL_CAMERA_TAG,
} from "../../../core/constants";
import { cameraImageUrl } from "../../../core/home-assistant";
import type {
  CompanionRotateAction,
  FrigateFallbackTransport,
  HomeAssistantActionConfig,
  LiveConnectionType,
  MinimalCameraMenuPosition,
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
  readonly highlightActivity: boolean;
  readonly holdAction: HomeAssistantActionConfig;
  readonly menuPosition: MinimalCameraMenuPosition;
  readonly rotateAction: CompanionRotateAction;
  readonly showFullscreenButton: boolean;
  readonly showMuteButton: boolean;
  readonly showPictureInPictureButton: boolean;
  readonly showSourceLabel: boolean;
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
    camera.highlightActivity = config.highlightActivity;
    camera.holdAction = config.holdAction;
    camera.menuPosition = config.menuPosition;
    camera.rotateAction = config.rotateAction;
    camera.showFullscreenButton = config.showFullscreenButton;
    camera.showMuteButton = config.showMuteButton;
    camera.showPictureInPictureButton = config.showPictureInPictureButton;
    camera.showSourceLabel = config.showSourceLabel;
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
  for (const [name, setting] of [
    ["highlightActivity", source.highlightActivity],
    ["showFullscreenButton", source.showFullscreenButton],
    ["showMuteButton", source.showMuteButton],
    ["showPictureInPictureButton", source.showPictureInPictureButton],
    ["showSourceLabel", source.showSourceLabel],
  ] as const) {
    if (typeof setting !== "boolean") {
      throw new Error(`Minimal camera requires a ${name} setting.`);
    }
  }
  if (
    source.rotateAction !== "none" &&
    source.rotateAction !== "double_column" &&
    source.rotateAction !== "fullscreen_live_video"
  ) {
    throw new Error("Minimal camera requires a valid rotateAction setting.");
  }
  if (
    source.menuPosition !== "top_left" &&
    source.menuPosition !== "top_right"
  ) {
    throw new Error("Minimal camera requires a valid menuPosition setting.");
  }
  return value as MinimalCameraModuleConfig;
}
