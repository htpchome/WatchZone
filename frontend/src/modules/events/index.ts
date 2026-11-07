import {
  EVENTS_MODULE_TYPE,
  EVENTS_TAG,
  MAX_EVENT_HISTORY_DAYS,
  MIN_EVENT_HISTORY_DAYS,
} from "../../core/constants";
import { englishLocalize } from "../../core/localization";
import type { ModuleDefinition } from "../../core/placeable";
import type { EventsModule } from "./events";

export interface EventsModuleConfig {
  readonly displayEventTypeBadges: boolean;
  readonly displayObjectBadges: boolean;
  readonly historyDays: number;
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
    if (typeof source.displayEventTypeBadges !== "boolean") {
      throw new Error(
        "Events module displayEventTypeBadges must be a boolean.",
      );
    }
    if (typeof source.displayObjectBadges !== "boolean") {
      throw new Error("Events module displayObjectBadges must be a boolean.");
    }
    if (
      typeof source.historyDays !== "number" ||
      !Number.isInteger(source.historyDays) ||
      source.historyDays < MIN_EVENT_HISTORY_DAYS ||
      source.historyDays > MAX_EVENT_HISTORY_DAYS
    ) {
      throw new Error(
        `Events module historyDays must be an integer from ${MIN_EVENT_HISTORY_DAYS} to ${MAX_EVENT_HISTORY_DAYS}.`,
      );
    }
    return {
      displayEventTypeBadges: source.displayEventTypeBadges,
      displayObjectBadges: source.displayObjectBadges,
      historyDays: source.historyDays,
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
    events.displayEventTypeBadges = config.displayEventTypeBadges;
    events.displayObjectBadges = config.displayObjectBadges;
    events.localize = context.localize ?? englishLocalize;
    events.historyDays = config.historyDays;
    events.roundedCorners = config.roundedCorners;
    events.targetModuleId = config.targetModuleId;
  },
};

export type { EventsModule } from "./events";
