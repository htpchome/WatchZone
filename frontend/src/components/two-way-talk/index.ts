import { TALK_COMPONENT_TYPE, TALK_TAG } from "../../core/constants";
import {
  isCameraConnectionSource,
  type CameraConnectionSource,
} from "../../core/camera-connection-source";
import { englishLocalize } from "../../core/localization";
import type { ComponentDefinition } from "../../core/placeable";
import type { TwoWayTalkComponent } from "./two-way-talk";

export interface TwoWayTalkComponentConfig {
  readonly cameras: readonly {
    readonly entityId: string;
    readonly source: CameraConnectionSource;
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
            typeof (camera as Record<string, unknown>).entityId !== "string" ||
            !String((camera as Record<string, unknown>).entityId).startsWith(
              "camera.",
            ) ||
            !isCameraConnectionSource(
              (camera as Record<string, unknown>).source,
            ),
        )
      ) {
        throw new Error("Two-way talk requires camera source identities.");
      }
      return {
        cameras: cameras.map((camera) => {
          const candidate = camera as Record<string, unknown>;
          return {
            entityId: candidate.entityId as string,
            source: candidate.source as CameraConnectionSource,
          };
        }),
      };
    },
  };

export type { TwoWayTalkComponent } from "./two-way-talk";
