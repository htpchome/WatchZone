import { TALK_COMPONENT_TYPE, TALK_TAG } from "../../../core/constants";
import { englishLocalize } from "../../../core/localization";
import type { ComponentDefinition } from "../../placeable";
import type { LiveConnectionType } from "../../../core/config";
import type { TwoWayTalkComponent } from "./two-way-talk";

export interface TwoWayTalkComponentConfig {
  readonly cameras: readonly {
    readonly connection: LiveConnectionType;
    readonly entityId: string;
  }[];
}

let definitionPromise: Promise<void> | undefined;

export const componentDefinition: ComponentDefinition<TwoWayTalkComponentConfig> =
  {
    type: TALK_COMPONENT_TYPE,
    createElement: () => document.createElement(TALK_TAG),
    define: () =>
      (definitionPromise ??= import("./two-way-talk").then(() => undefined)),
    getEntityIds: ({ cameras }) => cameras.map(({ entityId }) => entityId),
    updateElement(element, config, context) {
      const talk = element as TwoWayTalkComponent;
      talk.api = context.api;
      talk.cameraSession = context.cameraSession;
      talk.cameras = config.cameras;
      talk.localize = context.localize ?? englishLocalize;
    },
    validateConfig(value) {
      if (typeof value !== "object" || value === null)
        throw new Error("Two-way-talk configuration must be an object.");
      const cameras = (value as Record<string, unknown>).cameras;
      if (
        !Array.isArray(cameras) ||
        cameras.some(
          (camera) =>
            typeof camera !== "object" ||
            camera === null ||
            !("entityId" in camera) ||
            typeof camera.entityId !== "string" ||
            !camera.entityId.startsWith("camera.") ||
            !("connection" in camera) ||
            (camera.connection !== "home_assistant" &&
              camera.connection !== "frigate_go2rtc"),
        )
      ) {
        throw new Error("Two-way talk requires valid camera sources.");
      }
      return { cameras } as TwoWayTalkComponentConfig;
    },
  };

export type { TwoWayTalkComponent } from "./two-way-talk";
