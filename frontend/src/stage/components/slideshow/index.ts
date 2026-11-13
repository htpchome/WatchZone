import {
  SLIDESHOW_COMPONENT_TYPE,
  SLIDESHOW_TAG,
} from "../../../core/constants";
import { englishLocalize } from "../../../core/localization";
import type { ComponentDefinition } from "../../placeable";
import type { SlideshowComponent } from "./slideshow";

export interface SlideshowConfig {
  readonly targetModuleId: string;
}

let definitionPromise: Promise<void> | undefined;

export const componentDefinition: ComponentDefinition<
  SlideshowConfig,
  "cameraSelection" | "cameraSession"
> = {
  contextKeys: ["cameraSelection", "cameraSession"],
  type: SLIDESHOW_COMPONENT_TYPE,
  createElement: () => document.createElement(SLIDESHOW_TAG),
  define: () =>
    (definitionPromise ??= import("./slideshow").then(() => undefined)),
  getEntityIds: () => [],
  updateElement(element, config, context) {
    const slideshow = element as SlideshowComponent;
    slideshow.cameraSelection = context.cameraSelection;
    slideshow.cameraSession = context.cameraSession;
    slideshow.localize = context.localize ?? englishLocalize;
    slideshow.targetModuleId = config.targetModuleId;
  },
  validateConfig(value) {
    if (typeof value !== "object" || value === null) {
      throw new Error("Slideshow configuration must be an object.");
    }
    const targetModuleId = (value as Record<string, unknown>).targetModuleId;
    if (typeof targetModuleId !== "string" || targetModuleId.length === 0) {
      throw new Error("Slideshow requires a target camera module.");
    }
    return { targetModuleId };
  },
};

export type { SlideshowComponent } from "./slideshow";
