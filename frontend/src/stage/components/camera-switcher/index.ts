import {
  CAMERA_SWITCHER_COMPONENT_TYPE,
  CAMERA_SWITCHER_TAG,
} from "../../../core/constants";
import { englishLocalize } from "../../../core/localization";
import type { ComponentDefinition } from "../../placeable";
import type { CameraSwitcherComponent } from "./camera-switcher";

export interface CameraSwitcherConfig {
  readonly targetModuleId: string;
}

let definitionPromise: Promise<void> | undefined;

export const componentDefinition: ComponentDefinition<
  CameraSwitcherConfig,
  "cameraSelection" | "cameraSession"
> = {
  contextKeys: ["cameraSelection", "cameraSession"],
  type: CAMERA_SWITCHER_COMPONENT_TYPE,
  createElement: () => document.createElement(CAMERA_SWITCHER_TAG),
  define: () =>
    (definitionPromise ??= import("./camera-switcher").then(() => undefined)),
  getEntityIds: () => [],
  updateElement(element, config, context) {
    const switcher = element as CameraSwitcherComponent;
    switcher.cameraSelection = context.cameraSelection;
    switcher.cameraSession = context.cameraSession;
    switcher.localize = context.localize ?? englishLocalize;
    switcher.targetModuleId = config.targetModuleId;
  },
  validateConfig(value) {
    if (typeof value !== "object" || value === null) {
      throw new Error("Camera switcher configuration must be an object.");
    }
    const targetModuleId = (value as Record<string, unknown>).targetModuleId;
    if (typeof targetModuleId !== "string" || targetModuleId.length === 0) {
      throw new Error("Camera switcher requires a target camera module.");
    }
    return { targetModuleId };
  },
};

export type { CameraSwitcherComponent } from "./camera-switcher";
