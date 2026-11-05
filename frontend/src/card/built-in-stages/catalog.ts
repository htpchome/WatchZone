import type { CardConfig } from "../../core/config";
import {
  APP_ID,
  CAMERA_MODULE_TYPE,
  LIGHT_COMPONENT_TYPE,
  PTZ_COMPONENT_TYPE,
  TALK_COMPONENT_TYPE,
} from "../../core/constants";
import {
  validateStageDesign,
  type StageComponentNode,
  type StageDesignDocument,
  type StageFlow,
  type StageModuleNode,
  type StagePlacement,
  type StageVariant,
  type StageVariantName,
} from "../../core/layout";
import defaultStageJson from "./default.json";

export interface BuiltInStageSet {
  readonly designs: readonly StageDesignDocument[];
  readonly flow: StageFlow;
}

const defaultTemplate = namespaceTemplate(
  validateStageDesign(defaultStageJson),
);

/** Materializes immutable frontend templates with card-scoped runtime input. */
export function createBuiltInStageSet(config: CardConfig): BuiltInStageSet {
  const design = hydrateTemplate(defaultTemplate, config);
  return {
    designs: [design],
    flow: {
      default: [design.id],
      phone: [design.id],
    },
  };
}

function namespaceTemplate(template: StageDesignDocument): StageDesignDocument {
  return {
    ...template,
    id: namespacedId(template.id),
    variants: mapVariants(template, (variant) => ({
      root: {
        ...variant.root,
        children: variant.root.children.map(namespacePlacement),
        id: namespacedId(variant.root.id),
      },
    })),
  };
}

function namespacePlacement(placement: StagePlacement): StagePlacement {
  return {
    ...placement,
    node: {
      ...placement.node,
      id: namespacedId(placement.node.id),
      ...(placement.node.slots
        ? {
            slots: Object.fromEntries(
              Object.entries(placement.node.slots).map(([name, nodes]) => [
                name,
                nodes?.map((node) => ({
                  ...node,
                  id: namespacedId(node.id),
                })),
              ]),
            ),
          }
        : {}),
    },
  };
}

function hydrateTemplate(
  template: StageDesignDocument,
  config: CardConfig,
): StageDesignDocument {
  return {
    ...template,
    variants: mapVariants(template, (variant) => ({
      root: {
        ...variant.root,
        children: variant.root.children.flatMap((placement) => {
          const node = hydrateModule(placement.node, config);
          return node ? [{ ...placement, node }] : [];
        }),
      },
    })),
  };
}

function hydrateModule(
  node: StageModuleNode,
  config: CardConfig,
): StageModuleNode | undefined {
  if (node.moduleType !== CAMERA_MODULE_TYPE) return node;
  if (config.cameras.length === 0) return undefined;
  const overlay = (node.slots?.overlay ?? []).flatMap((component) => {
    const hydrated = hydrateCameraComponent(component, config);
    return hydrated ? [hydrated] : [];
  });
  return {
    ...node,
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
    ...(overlay.length ? { slots: { ...node.slots, overlay } } : { slots: {} }),
  };
}

function hydrateCameraComponent(
  node: StageComponentNode,
  config: CardConfig,
): StageComponentNode | undefined {
  if (node.componentType === TALK_COMPONENT_TYPE) {
    const enabledCameraIds = config.cameras
      .filter(({ two_way_talk_enabled: enabled }) => enabled)
      .map(({ entity_id: entityId }) => entityId);
    return enabledCameraIds.length
      ? { ...node, config: { enabledCameraIds } }
      : undefined;
  }
  if (node.componentType === PTZ_COMPONENT_TYPE) {
    const cameras = config.cameras
      .filter(({ ptz_enabled: enabled }) => enabled)
      .map(({ entity_id: entityId }) => ({
        entityId,
        provider: "home_assistant" as const,
      }));
    return cameras.length ? { ...node, config: { cameras } } : undefined;
  }
  if (node.componentType === LIGHT_COMPONENT_TYPE) {
    const cameras = config.cameras
      .filter(({ light_entity_ids: ids }) => ids.length > 0)
      .map(
        ({ entity_id: cameraEntityId, light_entity_ids: lightEntityIds }) => ({
          cameraEntityId,
          lightEntityIds,
        }),
      );
    return cameras.length ? { ...node, config: { cameras } } : undefined;
  }
  return node;
}

function mapVariants(
  design: StageDesignDocument,
  transform: (variant: StageVariant) => StageVariant,
): StageDesignDocument["variants"] {
  const variants: Partial<Record<StageVariantName, StageVariant>> = {};
  for (const name of ["default", "phone"] as const) {
    const variant = design.variants[name];
    if (variant) variants[name] = transform(variant);
  }
  return variants;
}

function namespacedId(id: string): string {
  return `${APP_ID}:${id}`;
}
