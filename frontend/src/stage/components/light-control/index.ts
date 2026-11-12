import {
  LIGHT_COMPONENT_TYPE,
  LIGHT_TAG,
  MAX_LIGHTS_PER_CAMERA,
} from "../../../core/constants";
import { englishLocalize } from "../../../core/localization";
import type { ComponentDefinition } from "../../placeable";
import type { LightControlComponent } from "./light-control";

export interface CameraLightConfig {
  readonly cameraEntityId: string;
  readonly lights: readonly {
    readonly entityId: string;
    readonly icon?: string;
  }[];
}

export interface LightControlComponentConfig {
  readonly cameras: readonly CameraLightConfig[];
}

let definitionPromise: Promise<void> | undefined;

export const componentDefinition: ComponentDefinition<
  LightControlComponentConfig,
  "cameraSession"
> = {
  contextKeys: ["cameraSession"],
  type: LIGHT_COMPONENT_TYPE,
  createElement: () => document.createElement(LIGHT_TAG),
  define: () =>
    (definitionPromise ??= import("./light-control").then(() => undefined)),
  getEntityIds: ({ cameras }) =>
    cameras.flatMap(({ lights }) => lights.map(({ entityId }) => entityId)),
  updateElement(element, config, context) {
    const control = element as LightControlComponent;
    control.cameraSession = context.cameraSession;
    control.cameras = config.cameras;
    control.hass = context.hass;
    control.localize = context.localize ?? englishLocalize;
  },
  validateConfig(value) {
    if (typeof value !== "object" || value === null) {
      throw new Error("Light control configuration must be an object.");
    }
    const cameras = (value as Record<string, unknown>).cameras;
    if (!Array.isArray(cameras)) {
      throw new Error("Light control requires configured cameras.");
    }
    return {
      cameras: cameras.map((camera) => validateCameraLights(camera)),
    };
  },
};

function validateCameraLights(value: unknown): CameraLightConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("Light control camera configuration must be an object.");
  }
  const source = value as Record<string, unknown>;
  if (
    typeof source.cameraEntityId !== "string" ||
    !source.cameraEntityId.startsWith("camera.")
  ) {
    throw new Error("Light control requires a camera entity ID.");
  }
  if (!Array.isArray(source.lights)) {
    throw new Error("Light control requires one or two unique light entities.");
  }
  const lights = source.lights.map((value) => {
    if (typeof value !== "object" || value === null) {
      throw new Error(
        "Light control requires one or two unique light entities.",
      );
    }
    const light = value as Record<string, unknown>;
    if (
      typeof light.entityId !== "string" ||
      !light.entityId.startsWith("light.") ||
      (light.icon !== undefined && typeof light.icon !== "string")
    ) {
      throw new Error(
        "Light control requires one or two unique light entities.",
      );
    }
    return {
      entityId: light.entityId,
      ...(typeof light.icon === "string" ? { icon: light.icon } : {}),
    };
  });
  if (
    lights.length === 0 ||
    lights.length > MAX_LIGHTS_PER_CAMERA ||
    new Set(lights.map(({ entityId }) => entityId)).size !== lights.length
  ) {
    throw new Error("Light control requires one or two unique light entities.");
  }
  return {
    cameraEntityId: source.cameraEntityId,
    lights,
  };
}

export type { LightControlComponent } from "./light-control";
