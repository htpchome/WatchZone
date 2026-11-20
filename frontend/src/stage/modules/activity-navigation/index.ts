import {
  ACTIVITY_NAVIGATION_MODULE_TYPE,
  ACTIVITY_NAVIGATION_TAG,
} from "../../../core/constants";
import { englishLocalize } from "../../../core/localization";
import type { ModuleDefinition } from "../../placeable";
import type { ActivityNavigationModule } from "./activity-navigation";

export type ActivityNavigationPresentation = "rail" | "toolbar";

export interface ActivityNavigationConfig {
  readonly presentation: ActivityNavigationPresentation;
  readonly targetStackId: string;
}

let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<
  ActivityNavigationConfig,
  | "activityFilter"
  | "cameraSelection"
  | "exportFilter"
  | "mediaDate"
  | "moduleStackNavigation"
> = {
  contextKeys: [
    "activityFilter",
    "cameraSelection",
    "exportFilter",
    "mediaDate",
    "moduleStackNavigation",
  ],
  type: ACTIVITY_NAVIGATION_MODULE_TYPE,
  createElement: () => document.createElement(ACTIVITY_NAVIGATION_TAG),
  define: () =>
    (definitionPromise ??= import("./activity-navigation").then(
      () => undefined,
    )),
  getEntityIds: () => [],
  updateElement(element, config, context) {
    const navigation = element as ActivityNavigationModule;
    navigation.activityFilter = context.activityFilter;
    navigation.cameraSelection = context.cameraSelection;
    navigation.exportFilter = context.exportFilter;
    navigation.locale = context.hass?.locale;
    navigation.localize = context.localize ?? englishLocalize;
    navigation.mediaDate = context.mediaDate;
    navigation.navigationContext = context.moduleStackNavigation;
    navigation.presentation = config.presentation;
    navigation.targetStackId = config.targetStackId;
  },
  validateConfig(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Activity navigation configuration must be an object.");
    }
    const source = value as Record<string, unknown>;
    if (
      typeof source.targetStackId !== "string" ||
      source.targetStackId.length === 0
    ) {
      throw new Error("Activity navigation requires a target stack.");
    }
    if (
      source.presentation !== undefined &&
      source.presentation !== "toolbar" &&
      source.presentation !== "rail"
    ) {
      throw new Error("Activity navigation requires a valid presentation.");
    }
    return {
      presentation: source.presentation === "rail" ? "rail" : "toolbar",
      targetStackId: source.targetStackId,
    };
  },
};

export type { ActivityNavigationModule } from "./activity-navigation";
