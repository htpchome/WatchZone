import {
  CAMERA_CONTROLS_MODULE_TYPE,
  CAMERA_CONTROLS_MODULE_TAG,
} from "../../../core/constants";
import type { LiveConnectionType } from "../../../core/config";
import type { PtzProviderId } from "../../../api/ptz";
import type { ModuleDefinition } from "../../placeable";

export interface CameraControlsModuleConfig {
  readonly targetModuleId: string;
  readonly talkCameras: readonly {
    readonly connection: LiveConnectionType;
    readonly entityId: string;
  }[];
  readonly ptzCameras: readonly {
    readonly entityId: string;
    readonly provider: PtzProviderId;
  }[];
}

let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<
  CameraControlsModuleConfig,
  never
> = {
  contextKeys: [],
  type: CAMERA_CONTROLS_MODULE_TYPE,
  createElement: () => document.createElement(CAMERA_CONTROLS_MODULE_TAG),
  define: () =>
    (definitionPromise ??= import("./camera-controls").then(() => undefined)),
  getEntityIds: () => [],
  updateElement: () => undefined,
  validateConfig(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Camera controls configuration must be an object.");
    }
    const source = value as Record<string, unknown>;
    if (
      typeof source.targetModuleId !== "string" ||
      source.targetModuleId.length === 0
    ) {
      throw new Error("Camera controls require a target camera module.");
    }
    return {
      targetModuleId: source.targetModuleId,
      talkCameras: validateTalkCameras(source.talkCameras),
      ptzCameras: validatePtzCameras(source.ptzCameras),
    };
  },
};

function validateTalkCameras(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate === null) return [];
    const source = candidate as Record<string, unknown>;
    if (
      typeof source.entityId !== "string" ||
      !source.entityId.startsWith("camera.") ||
      (source.connection !== "home_assistant" &&
        source.connection !== "frigate_go2rtc")
    ) {
      return [];
    }
    return [
      {
        connection: source.connection as LiveConnectionType,
        entityId: source.entityId,
      },
    ];
  });
}

function validatePtzCameras(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate === null) return [];
    const source = candidate as Record<string, unknown>;
    if (
      typeof source.entityId !== "string" ||
      !source.entityId.startsWith("camera.") ||
      (source.provider !== "home_assistant" &&
        source.provider !== "frigate_go2rtc")
    ) {
      return [];
    }
    return [
      {
        entityId: source.entityId,
        provider: source.provider as PtzProviderId,
      },
    ];
  });
}

export type { CameraControlsModule } from "./camera-controls";
