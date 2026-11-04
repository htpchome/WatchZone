import { TALK_MODULE_TYPE, TALK_TAG } from "../../core/constants";
import { englishLocalize } from "../../core/localization";
import type { ModuleDefinition } from "../../core/module";
import type { TwoWayTalkModule } from "./two-way-talk";

export interface TwoWayTalkModuleConfig {
  readonly enabledCameraIds: readonly string[];
}

let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<TwoWayTalkModuleConfig> = {
  type: TALK_MODULE_TYPE,
  createElement: () => document.createElement(TALK_TAG),
  define: () =>
    (definitionPromise ??= import("./two-way-talk").then(() => undefined)),
  getEntityIds: ({ enabledCameraIds }) => enabledCameraIds,
  updateElement(element, config, context) {
    const talk = element as TwoWayTalkModule;
    talk.api = context.api;
    talk.cameraSession = context.cameraSession;
    talk.enabledCameraIds = config.enabledCameraIds;
    talk.localize = context.localize ?? englishLocalize;
  },
  validateConfig(value) {
    if (typeof value !== "object" || value === null)
      throw new Error("Two-way-talk configuration must be an object.");
    const ids = (value as Record<string, unknown>).enabledCameraIds;
    if (
      !Array.isArray(ids) ||
      ids.some((id) => typeof id !== "string" || !id.startsWith("camera."))
    ) {
      throw new Error("Two-way talk requires camera entity IDs.");
    }
    return { enabledCameraIds: ids as string[] };
  },
};

export type { TwoWayTalkModule } from "./two-way-talk";
