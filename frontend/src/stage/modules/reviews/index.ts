import {
  REVIEWS_MODULE_TYPE,
  REVIEWS_TAG,
  MAX_EVENT_HISTORY_DAYS,
  MIN_EVENT_HISTORY_DAYS,
} from "../../../core/constants";
import { englishLocalize } from "../../../core/localization";
import type { ModuleDefinition } from "../../placeable";
import type { ReviewsModule } from "./reviews";

export interface ReviewsModuleConfig {
  readonly displayEventTypeBadges: boolean;
  readonly displayObjectBadges: boolean;
  readonly displayZone: boolean;
  readonly historyDays: number;
  readonly hoverPreviewEnabled: boolean;
  readonly roundedCorners: boolean;
  readonly shadows: boolean;
  readonly targetModuleId: string;
}

let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<
  ReviewsModuleConfig,
  "activityFilter" | "cameraSelection" | "mediaDate"
> = {
  contextKeys: ["activityFilter", "cameraSelection", "mediaDate"],
  type: REVIEWS_MODULE_TYPE,
  validateConfig(value) {
    if (typeof value !== "object" || value === null) {
      throw new Error("Reviews module configuration must be an object.");
    }
    const source = value as Record<string, unknown>;
    if (typeof source.targetModuleId !== "string" || !source.targetModuleId) {
      throw new Error("Reviews modules require a target camera module.");
    }
    if (typeof source.roundedCorners !== "boolean") {
      throw new Error("Reviews module roundedCorners must be a boolean.");
    }
    if (typeof source.shadows !== "boolean") {
      throw new Error("Reviews module shadows must be a boolean.");
    }
    if (typeof source.displayEventTypeBadges !== "boolean") {
      throw new Error(
        "Reviews module displayEventTypeBadges must be a boolean.",
      );
    }
    if (typeof source.displayObjectBadges !== "boolean") {
      throw new Error("Reviews module displayObjectBadges must be a boolean.");
    }
    if (typeof source.displayZone !== "boolean") {
      throw new Error("Reviews module displayZone must be a boolean.");
    }
    if (
      typeof source.historyDays !== "number" ||
      !Number.isInteger(source.historyDays) ||
      source.historyDays < MIN_EVENT_HISTORY_DAYS ||
      source.historyDays > MAX_EVENT_HISTORY_DAYS
    ) {
      throw new Error(
        `Reviews module historyDays must be an integer from ${MIN_EVENT_HISTORY_DAYS} to ${MAX_EVENT_HISTORY_DAYS}.`,
      );
    }
    if (typeof source.hoverPreviewEnabled !== "boolean") {
      throw new Error("Reviews module hoverPreviewEnabled must be a boolean.");
    }
    return {
      displayEventTypeBadges: source.displayEventTypeBadges,
      displayObjectBadges: source.displayObjectBadges,
      displayZone: source.displayZone,
      historyDays: source.historyDays,
      hoverPreviewEnabled: source.hoverPreviewEnabled,
      roundedCorners: source.roundedCorners,
      shadows: source.shadows,
      targetModuleId: source.targetModuleId,
    };
  },
  getEntityIds: () => [],
  define() {
    return (definitionPromise ??= import("./reviews").then(() => undefined));
  },
  createElement() {
    return document.createElement(REVIEWS_TAG);
  },
  updateElement(element, config, context) {
    const reviews = element as ReviewsModule;
    reviews.activityFilter = context.activityFilter;
    reviews.api = context.api;
    reviews.cameraSelection = context.cameraSelection;
    reviews.displayEventTypeBadges = config.displayEventTypeBadges;
    reviews.displayObjectBadges = config.displayObjectBadges;
    reviews.displayZone = config.displayZone;
    reviews.historyDays = config.historyDays;
    reviews.hoverPreviewEnabled = config.hoverPreviewEnabled;
    reviews.localize = context.localize ?? englishLocalize;
    reviews.mediaDate = context.mediaDate;
    reviews.roundedCorners = config.roundedCorners;
    reviews.shadows = config.shadows;
    reviews.targetModuleId = config.targetModuleId;
  },
};

export type { ReviewsModule } from "./reviews";
