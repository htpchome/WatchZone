import {
  RECORDINGS_MODULE_TYPE,
  RECORDINGS_TAG,
} from "../../../core/constants";
import { englishLocalize } from "../../../core/localization";
import type { ModuleDefinition } from "../../placeable";
import type { RecordingsModule } from "./recordings";

export interface RecordingsModuleConfig {
  readonly targetModuleId: string;
}

let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<RecordingsModuleConfig> = {
  type: RECORDINGS_MODULE_TYPE,
  validateConfig(value) {
    if (typeof value !== "object" || value === null) {
      throw new Error("Recordings module configuration must be an object.");
    }
    const source = value as Record<string, unknown>;
    if (typeof source.targetModuleId !== "string" || !source.targetModuleId) {
      throw new Error("Recordings modules require a target camera module.");
    }
    return {
      targetModuleId: source.targetModuleId,
    };
  },
  getEntityIds: () => [],
  define() {
    return (definitionPromise ??= import("./recordings").then(() => undefined));
  },
  createElement() {
    return document.createElement(RECORDINGS_TAG);
  },
  updateElement(element, config, context) {
    const recordings = element as RecordingsModule;
    recordings.api = context.api;
    recordings.cameraSelection = context.cameraSelection;
    recordings.localize = context.localize ?? englishLocalize;
    recordings.mediaDate = context.mediaDate;
    recordings.targetModuleId = config.targetModuleId;
  },
};

export type { RecordingsModule } from "./recordings";
