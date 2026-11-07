import { EVENTS_MODULE_TYPE, EVENTS_TAG } from "../../core/constants";
import { englishLocalize } from "../../core/localization";
import type { ModuleDefinition } from "../../core/placeable";
import type { EventsModule } from "./events";

export interface EventsModuleConfig {
  readonly roundedCorners: boolean;
  readonly targetModuleId: string;
}

let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<EventsModuleConfig> = {
  type: EVENTS_MODULE_TYPE,
  validateConfig(value) {
    if (typeof value !== "object" || value === null) {
      throw new Error("Events module configuration must be an object.");
    }
    const source = value as Record<string, unknown>;
    if (typeof source.targetModuleId !== "string" || !source.targetModuleId) {
      throw new Error("Events modules require a target camera module.");
    }
    if (typeof source.roundedCorners !== "boolean") {
      throw new Error("Events module roundedCorners must be a boolean.");
    }
    return {
      roundedCorners: source.roundedCorners,
      targetModuleId: source.targetModuleId,
    };
  },
  getEntityIds: () => [],
  define() {
    return (definitionPromise ??= import("./events").then(() => undefined));
  },
  createElement() {
    return document.createElement(EVENTS_TAG);
  },
  updateElement(element, config, context) {
    const events = element as EventsModule;
    events.api = context.api;
    events.cameraSelection = context.cameraSelection;
    events.localize = context.localize ?? englishLocalize;
    events.roundedCorners = config.roundedCorners;
    events.targetModuleId = config.targetModuleId;
  },
};

export type { EventsModule } from "./events";
