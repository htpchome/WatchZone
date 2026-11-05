import type { CardConfig } from "../core/config";
import {
  CAMERA_MODULE_TYPE,
  DEFAULT_CAMERA_MODULE_NODE_ID,
  DEFAULT_LAYOUT_ROOT_NODE_ID,
  DEFAULT_PTZ_COMPONENT_NODE_ID,
  DEFAULT_STAGE_DESIGN_ID,
  DEFAULT_TALK_COMPONENT_NODE_ID,
  PTZ_COMPONENT_TYPE,
  TALK_COMPONENT_TYPE,
} from "../core/constants";
import {
  STAGE_SCHEMA_VERSION,
  type StageComponentNode,
  type StageDesignDocument,
  type StageModuleNode,
  type StageVariant,
} from "../core/layout";

const DEFAULT_COLUMNS = 12;
const PHONE_COLUMNS = 4;

/**
 * Transitional seed for the built-in stage. Card camera inputs are projected
 * once into the versioned stage contract until saved stage selection replaces
 * the initial Lovelace input.
 */
export function createDefaultStageDesign(
  config: CardConfig,
): StageDesignDocument {
  const camera = createCameraModule(config);
  return {
    id: DEFAULT_STAGE_DESIGN_ID,
    name: "Default",
    revision: 0,
    schemaVersion: STAGE_SCHEMA_VERSION,
    variants: {
      default: createVariant(camera, DEFAULT_COLUMNS),
      phone: createVariant(camera, PHONE_COLUMNS),
    },
  };
}

function createVariant(
  camera: StageModuleNode | undefined,
  columns: number,
): StageVariant {
  return {
    root: {
      children: camera
        ? [
            {
              grid: { column: 1, columnSpan: columns, row: 1, rowSpan: 1 },
              node: camera,
            },
          ]
        : [],
      columns,
      id: DEFAULT_LAYOUT_ROOT_NODE_ID,
      kind: "container",
    },
  };
}

function createCameraModule(config: CardConfig): StageModuleNode | undefined {
  if (config.cameras.length === 0) return undefined;
  const overlay = [
    createTalkComponent(config),
    createPtzComponent(config),
  ].filter((node): node is StageComponentNode => node !== undefined);
  return {
    config: {
      cameras: config.cameras.map((camera) => ({
        entityId: camera.entity_id,
        lowLatencyHls: camera.low_latency_hls,
        startUnmutedPcTablet: camera.start_live_unmuted_pc_tablet,
        startUnmutedPhone: camera.start_live_unmuted_phone,
      })),
      retentionPreference: config.mobile_data_saving
        ? "reduced_bandwidth"
        : "automatic",
      roundedCorners: config.camera_rounded_corners,
      shadowStyle: config.camera_shadows ? "medium" : "none",
    },
    id: DEFAULT_CAMERA_MODULE_NODE_ID,
    kind: "module",
    moduleType: CAMERA_MODULE_TYPE,
    ...(overlay.length ? { slots: { overlay } } : {}),
  };
}

function createTalkComponent(
  config: CardConfig,
): StageComponentNode | undefined {
  const enabledCameraIds = config.cameras
    .filter(({ two_way_talk_enabled: enabled }) => enabled)
    .map(({ entity_id: entityId }) => entityId);
  return enabledCameraIds.length
    ? {
        componentType: TALK_COMPONENT_TYPE,
        config: { enabledCameraIds },
        id: DEFAULT_TALK_COMPONENT_NODE_ID,
        kind: "component",
      }
    : undefined;
}

function createPtzComponent(
  config: CardConfig,
): StageComponentNode | undefined {
  const cameras = config.cameras
    .filter(({ ptz_enabled: enabled }) => enabled)
    .map(({ entity_id: entityId }) => ({
      entityId,
      provider: "home_assistant" as const,
    }));
  return cameras.length
    ? {
        componentType: PTZ_COMPONENT_TYPE,
        config: { cameras },
        id: DEFAULT_PTZ_COMPONENT_NODE_ID,
        kind: "component",
      }
    : undefined;
}
