import { PANEL_MODULE_TYPE, PANEL_TAG } from "../../../core/constants";
import type { ModuleDefinition } from "../../placeable";

export type PanelModuleConfig = Readonly<Record<string, never>>;

let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<PanelModuleConfig> = {
  type: PANEL_MODULE_TYPE,
  createElement: () => document.createElement(PANEL_TAG),
  define: () => (definitionPromise ??= import("./panel").then(() => undefined)),
  getEntityIds: () => [],
  updateElement: () => undefined,
  validateConfig(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Panel module configuration must be an object.");
    }
    return {};
  },
};

export type { PanelModule } from "./panel";
