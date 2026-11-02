import type { CardConfig } from "../core/config";
import {
  CAMERA_MODULE_TYPE,
  DEFAULT_CAMERA_MODULE_NODE_ID,
  DEFAULT_LAYOUT_ROOT_NODE_ID,
} from "../core/constants";
import type { LayoutDocument, LayoutModuleNode } from "../core/layout";

export function createDefaultCardLayout(config: CardConfig): LayoutDocument {
  const cameraNode: LayoutModuleNode | undefined = config.camera_entity
    ? {
        config: {
          entityId: config.camera_entity,
          lowLatencyHls: config.low_latency_hls !== false,
          roundedCorners: config.camera_rounded_corners !== false,
          shadowStyle: config.camera_shadows === false ? "none" : "medium",
          startUnmutedPcTablet: config.start_live_unmuted_pc_tablet === true,
          startUnmutedPhone: config.start_live_unmuted_phone === true,
        },
        id: DEFAULT_CAMERA_MODULE_NODE_ID,
        kind: "module",
        moduleType: CAMERA_MODULE_TYPE,
      }
    : undefined;
  return {
    root: {
      children: cameraNode ? [cameraNode] : [],
      id: DEFAULT_LAYOUT_ROOT_NODE_ID,
      kind: "container",
    },
  };
}
