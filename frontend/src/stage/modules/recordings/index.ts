import {
  MAX_EVENT_HISTORY_DAYS,
  MIN_EVENT_HISTORY_DAYS,
  RECORDINGS_MODULE_TYPE,
  RECORDINGS_TAG,
} from "../../../core/constants";
import { englishLocalize } from "../../../core/localization";
import type { ModuleDefinition } from "../../placeable";
import type { RecordingsModule } from "./recordings";

export interface RecordingsModuleConfig {
  readonly historyDays: number;
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
    if (
      typeof source.historyDays !== "number" ||
      !Number.isInteger(source.historyDays) ||
      source.historyDays < MIN_EVENT_HISTORY_DAYS ||
      source.historyDays > MAX_EVENT_HISTORY_DAYS
    ) {
      throw new Error(
        `Recordings module historyDays must be an integer from ${MIN_EVENT_HISTORY_DAYS} to ${MAX_EVENT_HISTORY_DAYS}.`,
      );
    }
    return {
      historyDays: source.historyDays,
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
    recordings.historyDays = config.historyDays;
    recordings.localize = context.localize ?? englishLocalize;
    recordings.mediaDate = context.mediaDate;
    recordings.targetModuleId = config.targetModuleId;
  },
};

export type { RecordingsModule } from "./recordings";
