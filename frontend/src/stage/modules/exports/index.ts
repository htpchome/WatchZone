import { EXPORTS_MODULE_TYPE, EXPORTS_TAG } from "../../../core/constants";
import { englishLocalize } from "../../../core/localization";
import type { ModuleDefinition } from "../../placeable";
import type { ExportsModule } from "./exports";

export interface ExportsModuleConfig {
  readonly hoverPreviewEnabled: boolean;
  readonly targetModuleId: string;
}

let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<
  ExportsModuleConfig,
  "cameraSelection" | "exportFilter"
> = {
  contextKeys: ["cameraSelection", "exportFilter"],
  type: EXPORTS_MODULE_TYPE,
  validateConfig(value) {
    if (typeof value !== "object" || value === null) {
      throw new Error("Exports module configuration must be an object.");
    }
    const source = value as Record<string, unknown>;
    if (typeof source.targetModuleId !== "string" || !source.targetModuleId) {
      throw new Error("Exports modules require a target camera module.");
    }
    return {
      hoverPreviewEnabled: source.hoverPreviewEnabled !== false,
      targetModuleId: source.targetModuleId,
    };
  },
  getEntityIds: () => [],
  define() {
    return (definitionPromise ??= import("./exports").then(() => undefined));
  },
  createElement() {
    return document.createElement(EXPORTS_TAG);
  },
  updateElement(element, config, context) {
    const exports = element as ExportsModule;
    exports.api = context.api;
    exports.cameraSelection = context.cameraSelection;
    exports.exportFilter = context.exportFilter;
    exports.hoverPreviewEnabled = config.hoverPreviewEnabled;
    exports.localize = context.localize ?? englishLocalize;
    exports.placeableId = context.placeableId;
    exports.targetModuleId = config.targetModuleId;
  },
};

export type { ExportsModule } from "./exports";
