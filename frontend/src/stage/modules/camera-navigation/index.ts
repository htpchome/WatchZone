import {
  CAMERA_NAVIGATION_MODULE_TYPE,
  CAMERA_NAVIGATION_TAG,
} from "../../../core/constants";
import { englishLocalize } from "../../../core/localization";
import type { ModuleDefinition } from "../../placeable";
import type { CameraNavigationModule } from "./camera-navigation";

export interface CameraNavigationConfig {
  readonly roundedCorners: boolean;
  readonly shadows: boolean;
  readonly targetModuleId: string;
}

let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<
  CameraNavigationConfig,
  "cameraSelection"
> = {
  contextKeys: ["cameraSelection"],
  type: CAMERA_NAVIGATION_MODULE_TYPE,
  createElement: () => document.createElement(CAMERA_NAVIGATION_TAG),
  define: () =>
    (definitionPromise ??= import("./camera-navigation").then(() => undefined)),
  getEntityIds: () => [],
  updateElement(element, config, context) {
    const navigation = element as CameraNavigationModule;
    navigation.cameraSelection = context.cameraSelection;
    navigation.localize = context.localize ?? englishLocalize;
    navigation.roundedCorners = config.roundedCorners;
    navigation.shadows = config.shadows;
    navigation.targetModuleId = config.targetModuleId;
  },
  validateConfig(value) {
    if (typeof value !== "object" || value === null) {
      throw new Error("Camera navigation configuration must be an object.");
    }
    const targetModuleId = (value as Record<string, unknown>).targetModuleId;
    const shadows = (value as Record<string, unknown>).shadows;
    const roundedCorners = (value as Record<string, unknown>).roundedCorners;
    if (typeof targetModuleId !== "string" || targetModuleId.length === 0) {
      throw new Error("Camera navigation requires a target camera module.");
    }
    if (shadows !== undefined && typeof shadows !== "boolean") {
      throw new Error("Camera navigation shadows must be a boolean.");
    }
    if (roundedCorners !== undefined && typeof roundedCorners !== "boolean") {
      throw new Error("Camera navigation roundedCorners must be a boolean.");
    }
    return {
      roundedCorners: roundedCorners !== false,
      shadows: shadows !== false,
      targetModuleId,
    };
  },
};

export type { CameraNavigationModule } from "./camera-navigation";
