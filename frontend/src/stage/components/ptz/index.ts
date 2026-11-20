import { PTZ_COMPONENT_TYPE, PTZ_TAG } from "../../../core/constants";
import { englishLocalize } from "../../../core/localization";
import type { ComponentDefinition } from "../../placeable";
import type { PtzProviderId } from "../../../api/ptz";
import type { PtzComponent } from "./ptz";
import type { PtzCameraSource } from "./session.controller";

export interface PtzComponentConfig {
  readonly cameras: readonly PtzCameraSource[];
  readonly initialState: "closed" | "open";
}

let definitionPromise: Promise<void> | undefined;

export const componentDefinition: ComponentDefinition<
  PtzComponentConfig,
  "cameraSession"
> = {
  contextKeys: ["cameraSession"],
  type: PTZ_COMPONENT_TYPE,
  createElement: () => document.createElement(PTZ_TAG),
  define: () => (definitionPromise ??= import("./ptz").then(() => undefined)),
  getEntityIds: ({ cameras }) => cameras.map(({ entityId }) => entityId),
  updateElement(element, config, context) {
    const ptz = element as PtzComponent;
    ptz.api = context.api;
    ptz.cameraSession = context.cameraSession;
    ptz.cameras = config.cameras;
    ptz.initialState = config.initialState;
    ptz.localize = context.localize ?? englishLocalize;
  },
  validateConfig(value) {
    if (typeof value !== "object" || value === null)
      throw new Error("PTZ configuration must be an object.");
    const sourceConfig = value as Record<string, unknown>;
    const cameras = sourceConfig.cameras;
    if (!Array.isArray(cameras))
      throw new Error("PTZ requires configured cameras.");
    const normalized = cameras.map((camera) => {
      if (typeof camera !== "object" || camera === null)
        throw new Error("PTZ camera configuration must be an object.");
      const source = camera as Record<string, unknown>;
      if (
        typeof source.entityId !== "string" ||
        !source.entityId.startsWith("camera.") ||
        (source.provider !== "home_assistant" &&
          source.provider !== "frigate_go2rtc")
      ) {
        throw new Error("PTZ requires a supported camera provider.");
      }
      return {
        entityId: source.entityId,
        provider: source.provider as PtzProviderId,
      };
    });
    if (
      sourceConfig.initialState !== undefined &&
      sourceConfig.initialState !== "closed" &&
      sourceConfig.initialState !== "open"
    ) {
      throw new Error("PTZ initial state must be closed or open.");
    }
    return {
      cameras: normalized,
      initialState: sourceConfig.initialState === "closed" ? "closed" : "open",
    };
  },
};

export type { PtzComponent } from "./ptz";
