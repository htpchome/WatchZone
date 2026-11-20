import { PTZ_PANEL_MODULE_TYPE, PTZ_PANEL_TAG } from "../../../core/constants";
import type { ModuleDefinition } from "../../placeable";
import type { PtzPanelModule } from "./ptz-panel";

export interface PtzPanelModuleConfig {
  readonly cameraEntityIds: readonly string[];
  readonly targetModuleId: string;
}

let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<
  PtzPanelModuleConfig,
  "cameraSelection"
> = {
  contextKeys: ["cameraSelection"],
  type: PTZ_PANEL_MODULE_TYPE,
  createElement: () => document.createElement(PTZ_PANEL_TAG),
  define: () =>
    (definitionPromise ??= import("./ptz-panel").then(() => undefined)),
  getEntityIds: ({ cameraEntityIds }) => cameraEntityIds,
  updateElement(element, config, context) {
    const panel = element as PtzPanelModule;
    panel.cameraEntityIds = config.cameraEntityIds;
    panel.cameraSelection = context.cameraSelection;
    panel.targetModuleId = config.targetModuleId;
  },
  validateConfig(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("PTZ panel configuration must be an object.");
    }
    const source = value as Record<string, unknown>;
    if (
      !Array.isArray(source.cameraEntityIds) ||
      source.cameraEntityIds.some(
        (entityId) =>
          typeof entityId !== "string" || !entityId.startsWith("camera."),
      )
    ) {
      throw new Error("PTZ panel requires configured cameras.");
    }
    if (
      typeof source.targetModuleId !== "string" ||
      source.targetModuleId.length === 0
    ) {
      throw new Error("PTZ panel requires a target camera module.");
    }
    return {
      cameraEntityIds: source.cameraEntityIds as string[],
      targetModuleId: source.targetModuleId,
    };
  },
};

export type { PtzPanelModule } from "./ptz-panel";
