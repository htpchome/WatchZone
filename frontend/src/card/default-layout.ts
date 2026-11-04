import type { CardConfig } from "../core/config";
import {
  CAMERA_MODULE_TYPE,
  DEFAULT_CAMERA_MODULE_NODE_ID,
  DEFAULT_LAYOUT_ROOT_NODE_ID,
} from "../core/constants";
import type { LayoutDocument, LayoutModuleNode } from "../core/layout";

export function createDefaultCardLayout(config: CardConfig): LayoutDocument {
  const cameraNode: LayoutModuleNode | undefined = config.cameras.length
    ? {
        config: {
          cameras: config.cameras.map((camera) => ({
            entityId: camera.entity_id,
            lowLatencyHls: camera.low_latency_hls,
            roundedCorners: camera.camera_rounded_corners,
            shadowStyle: camera.camera_shadows ? "medium" : "none",
            startUnmutedPcTablet: camera.start_live_unmuted_pc_tablet,
            startUnmutedPhone: camera.start_live_unmuted_phone,
          })),
          retentionPreference: config.mobile_data_saving
            ? "reduced_bandwidth"
            : "automatic",
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
