import {
  ALERTS_MODULE_TYPE,
  ALERTS_TAG,
  MAX_EVENT_HISTORY_DAYS,
  MIN_EVENT_HISTORY_DAYS,
} from "../../../core/constants";
import { englishLocalize } from "../../../core/localization";
import type { ModuleDefinition } from "../../placeable";
import type { AlertsModule } from "./alerts";

export interface AlertsModuleConfig {
  readonly displayEventTypeBadges: boolean;
  readonly displayObjectBadges: boolean;
  readonly displayZone: boolean;
  readonly historyDays: number;
  readonly roundedCorners: boolean;
  readonly targetModuleId: string;
}

let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<AlertsModuleConfig> = {
  type: ALERTS_MODULE_TYPE,
  validateConfig(value) {
    if (typeof value !== "object" || value === null) {
      throw new Error("Alerts module configuration must be an object.");
    }
    const source = value as Record<string, unknown>;
    if (typeof source.targetModuleId !== "string" || !source.targetModuleId) {
      throw new Error("Alerts modules require a target camera module.");
    }
    if (typeof source.roundedCorners !== "boolean") {
      throw new Error("Alerts module roundedCorners must be a boolean.");
    }
    if (typeof source.displayEventTypeBadges !== "boolean") {
      throw new Error(
        "Alerts module displayEventTypeBadges must be a boolean.",
      );
    }
    if (typeof source.displayObjectBadges !== "boolean") {
      throw new Error("Alerts module displayObjectBadges must be a boolean.");
    }
    if (typeof source.displayZone !== "boolean") {
      throw new Error("Alerts module displayZone must be a boolean.");
    }
    if (
      typeof source.historyDays !== "number" ||
      !Number.isInteger(source.historyDays) ||
      source.historyDays < MIN_EVENT_HISTORY_DAYS ||
      source.historyDays > MAX_EVENT_HISTORY_DAYS
    ) {
      throw new Error(
        `Alerts module historyDays must be an integer from ${MIN_EVENT_HISTORY_DAYS} to ${MAX_EVENT_HISTORY_DAYS}.`,
      );
    }
    return {
      displayEventTypeBadges: source.displayEventTypeBadges,
      displayObjectBadges: source.displayObjectBadges,
      displayZone: source.displayZone,
      historyDays: source.historyDays,
      roundedCorners: source.roundedCorners,
      targetModuleId: source.targetModuleId,
    };
  },
  getEntityIds: () => [],
  define() {
    return (definitionPromise ??= import("./alerts").then(() => undefined));
  },
  createElement() {
    return document.createElement(ALERTS_TAG);
  },
  updateElement(element, config, context) {
    const alerts = element as AlertsModule;
    alerts.activityDateFilter = context.activityDateFilter;
    alerts.api = context.api;
    alerts.cameraSelection = context.cameraSelection;
    alerts.displayEventTypeBadges = config.displayEventTypeBadges;
    alerts.displayObjectBadges = config.displayObjectBadges;
    alerts.displayZone = config.displayZone;
    alerts.historyDays = config.historyDays;
    alerts.localize = context.localize ?? englishLocalize;
    alerts.roundedCorners = config.roundedCorners;
    alerts.targetModuleId = config.targetModuleId;
  },
};

export type { AlertsModule } from "./alerts";
