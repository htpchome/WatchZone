import {
  LIGHT_COMPONENT_TYPE,
  LIGHT_TAG,
  MAX_LIGHTS_PER_CAMERA,
} from "../../core/constants";
import { englishLocalize } from "../../core/localization";
import { normalizeLightIcon } from "../../core/light-icons";
import type { ComponentDefinition } from "../../core/placeable";
import type { LightControlComponent } from "./light-control";

export interface CameraLightConfig {
  readonly cameraEntityId: string;
  readonly lights: readonly LightConfig[];
}

export interface LightConfig {
  readonly entityId: string;
  readonly icon: string;
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
  if (
    !Array.isArray(source.lights) ||
    source.lights.length === 0 ||
    source.lights.length > MAX_LIGHTS_PER_CAMERA
  ) {
    throw new Error("Light control requires one or two unique light entities.");
  }
  const lights = source.lights.map((value) => validateLight(value));
  if (new Set(lights.map(({ entityId }) => entityId)).size !== lights.length) {
    throw new Error("Light control requires one or two unique light entities.");
  }
  return {
    cameraEntityId: source.cameraEntityId,
    lights,
  };
}

function validateLight(value: unknown): LightConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("Light control requires valid light configuration.");
  }
  const source = value as Record<string, unknown>;
  if (
    typeof source.entityId !== "string" ||
    !source.entityId.startsWith("light.")
  ) {
    throw new Error("Light control requires valid light configuration.");
  }
  return {
    entityId: source.entityId,
    icon: normalizeLightIcon(source.icon),
  };
}

export type { LightControlComponent } from "./light-control";
