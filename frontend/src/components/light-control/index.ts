import {
  LIGHT_COMPONENT_TYPE,
  LIGHT_TAG,
  MAX_LIGHTS_PER_CAMERA,
} from "../../core/constants";
import { englishLocalize } from "../../core/localization";
import type { ComponentDefinition } from "../../core/placeable";
import type { LightControlComponent } from "./light-control";

export interface CameraLightConfig {
  readonly cameraEntityId: string;
  readonly lightEntityIds: readonly string[];
}

export interface LightControlComponentConfig {
  readonly cameras: readonly CameraLightConfig[];
}

let definitionPromise: Promise<void> | undefined;

export const componentDefinition: ComponentDefinition<LightControlComponentConfig> =
  {
    type: LIGHT_COMPONENT_TYPE,
    createElement: () => document.createElement(LIGHT_TAG),
    define: () =>
      (definitionPromise ??= import("./light-control").then(() => undefined)),
    getEntityIds: ({ cameras }) =>
      cameras.flatMap(({ lightEntityIds }) => lightEntityIds),
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
  if (
    !Array.isArray(source.lightEntityIds) ||
    source.lightEntityIds.length === 0 ||
    source.lightEntityIds.length > MAX_LIGHTS_PER_CAMERA ||
    source.lightEntityIds.some(
      (id) => typeof id !== "string" || !id.startsWith("light."),
    ) ||
    new Set(source.lightEntityIds).size !== source.lightEntityIds.length
  ) {
    throw new Error("Light control requires one or two unique light entities.");
  }
  return {
    cameraEntityId: source.cameraEntityId,
    lightEntityIds: source.lightEntityIds as string[],
  };
}

export type { LightControlComponent } from "./light-control";
