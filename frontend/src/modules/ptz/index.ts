import { PTZ_MODULE_TYPE, PTZ_TAG } from "../../core/constants";
import { englishLocalize } from "../../core/localization";
import type { ModuleDefinition } from "../../core/module";
import type { PtzProviderId } from "../../api/ptz";
import type { PtzModule } from "./ptz";
import type { PtzCameraSource } from "./session.controller";

export interface PtzModuleConfig {
  readonly cameras: readonly PtzCameraSource[];
}

let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<PtzModuleConfig> = {
  type: PTZ_MODULE_TYPE,
  createElement: () => document.createElement(PTZ_TAG),
  define: () => (definitionPromise ??= import("./ptz").then(() => undefined)),
  getEntityIds: ({ cameras }) => cameras.map(({ entityId }) => entityId),
  updateElement(element, config, context) {
    const ptz = element as PtzModule;
    ptz.api = context.api;
    ptz.cameraSession = context.cameraSession;
    ptz.cameras = config.cameras;
    ptz.localize = context.localize ?? englishLocalize;
  },
  validateConfig(value) {
    if (typeof value !== "object" || value === null)
      throw new Error("PTZ configuration must be an object.");
    const cameras = (value as Record<string, unknown>).cameras;
    if (!Array.isArray(cameras))
      throw new Error("PTZ requires configured cameras.");
    const normalized = cameras.map((camera) => {
      if (typeof camera !== "object" || camera === null)
        throw new Error("PTZ camera configuration must be an object.");
      const source = camera as Record<string, unknown>;
      if (
        typeof source.entityId !== "string" ||
        !source.entityId.startsWith("camera.") ||
        source.provider !== "home_assistant"
      ) {
        throw new Error("PTZ requires a supported camera provider.");
      }
      return {
        entityId: source.entityId,
        provider: source.provider as PtzProviderId,
      };
    });
    return { cameras: normalized };
  },
};

export type { PtzModule } from "./ptz";
