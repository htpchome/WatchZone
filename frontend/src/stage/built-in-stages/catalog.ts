import type { CardConfig } from "../../core/config";
import {
  APP_ID,
  ALERTS_MODULE_TYPE,
  CAMERA_NAVIGATION_COMPONENT_TYPE,
  CAMERA_MODULE_TYPE,
  EVENTS_MODULE_TYPE,
  LIGHT_COMPONENT_TYPE,
  PTZ_COMPONENT_TYPE,
  PANEL_MODULE_TYPE,
  TALK_COMPONENT_TYPE,
} from "../../core/constants";
import {
  validateStageDesign,
  type StageComponentNode,
  type StageDesignDocument,
  type StageFlow,
  type StageModuleNode,
  type StagePlacement,
  type StageStackNode,
  type StageVariant,
  type StageVariantName,
} from "../layout";
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
    node:
      placement.node.kind === "stack"
        ? {
            ...placement.node,
            children: placement.node.children.map(namespaceModule),
            id: namespacedId(placement.node.id),
          }
        : namespaceModule(placement.node),
  };
}

function namespaceModule(node: StageModuleNode): StageModuleNode {
  return {
    ...node,
    config: namespaceModuleConfig(node),
    id: namespacedId(node.id),
    ...(node.slots
      ? {
          slots: Object.fromEntries(
            Object.entries(node.slots).map(([name, nodes]) => [
              name,
              nodes?.map((component) => ({
                ...component,
                config: namespaceComponentConfig(component),
                id: namespacedId(component.id),
              })),
            ]),
          ),
        }
      : {}),
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
        rows:
          config.cameras.length === 0
            ? variant.root.rows.slice(0, 2)
            : variant.root.rows,
        children: variant.root.children.flatMap((placement) => {
          const node = hydratePlacementNode(placement.node, config);
          return node ? [{ ...placement, node }] : [];
        }),
      },
    })),
  };
}

function hydratePlacementNode(
  node: StageModuleNode | StageStackNode,
  config: CardConfig,
): StageModuleNode | StageStackNode | undefined {
  if (node.kind === "module") return hydrateModule(node, config);
  const children = node.children.flatMap((child) => {
    const hydrated = hydrateModule(child, config);
    return hydrated ? [hydrated] : [];
  });
  return children.length ? { ...node, children } : undefined;
}

function hydrateModule(
  node: StageModuleNode,
  config: CardConfig,
): StageModuleNode | undefined {
  if (node.moduleType === PANEL_MODULE_TYPE && config.cameras.length === 0) {
    return undefined;
  }
  if (node.moduleType === PANEL_MODULE_TYPE) {
    return {
      ...node,
      slots: Object.fromEntries(
        Object.entries(node.slots ?? {}).map(([name, components]) => [
          name,
          components?.map((component) =>
            hydrateRuntimeComponent(component, config),
          ),
        ]),
      ),
    };
  }
  if (
    node.moduleType === EVENTS_MODULE_TYPE ||
    node.moduleType === ALERTS_MODULE_TYPE
  ) {
    if (config.cameras.length === 0) return undefined;
    const moduleConfig =
      typeof node.config === "object" && node.config !== null
        ? node.config
        : {};
    return {
      ...node,
      config: {
        ...moduleConfig,
        displayEventTypeBadges: config.display_event_type_badges,
        displayObjectBadges: config.display_object_badges,
        displayZone: config.display_zone,
        historyDays: config.event_history_days,
        roundedCorners: config.event_rounded_corners,
      },
    };
  }
  if (node.moduleType !== CAMERA_MODULE_TYPE) return node;
  if (config.cameras.length === 0) return undefined;
  const slots = Object.fromEntries(
    Object.entries(node.slots ?? {}).flatMap(([name, components]) => {
      const hydrated = (components ?? []).flatMap((component) => {
        const cameraComponent = hydrateCameraComponent(component, config);
        return cameraComponent
          ? [hydrateRuntimeComponent(cameraComponent, config)]
          : [];
      });
      return hydrated.length ? [[name, hydrated]] : [];
    }),
  );
  return {
    ...node,
    config: {
      cameras: config.cameras.map((camera) => ({
        connection: camera.connection,
        entityId: camera.entity_id,
        frigateFallback: camera.frigate_fallback,
        lowLatencyHls: camera.low_latency_hls,
        startUnmutedPcTablet: camera.start_live_unmuted_pc_tablet,
        startUnmutedPhone: camera.start_live_unmuted_phone,
        title: camera.title,
      })),
      highlightActivity: config.highlight_camera_on_activity,
      retentionPreference: config.mobile_data_saving
        ? "reduced_bandwidth"
        : "automatic",
      roundedCorners: config.camera_rounded_corners,
      shadowStyle: config.camera_shadows ? "medium" : "none",
    },
    slots,
  };
}

function namespaceModuleConfig(node: StageModuleNode): unknown {
  if (
    node.moduleType !== EVENTS_MODULE_TYPE &&
    node.moduleType !== ALERTS_MODULE_TYPE
  )
    return node.config;
  if (typeof node.config !== "object" || node.config === null)
    return node.config;
  const targetModuleId = (node.config as Record<string, unknown>)
    .targetModuleId;
  return typeof targetModuleId === "string"
    ? { ...node.config, targetModuleId: namespacedId(targetModuleId) }
    : node.config;
}

function hydrateRuntimeComponent(
  node: StageComponentNode,
  config: CardConfig,
): StageComponentNode {
  if (node.componentType !== CAMERA_NAVIGATION_COMPONENT_TYPE) return node;
  const componentConfig =
    typeof node.config === "object" && node.config !== null ? node.config : {};
  return {
    ...node,
    config: { ...componentConfig, shadows: config.camera_bar_shadows },
  };
}

function namespaceComponentConfig(node: StageComponentNode): unknown {
  if (node.componentType !== CAMERA_NAVIGATION_COMPONENT_TYPE)
    return node.config;
  if (typeof node.config !== "object" || node.config === null)
    return node.config;
  const targetModuleId = (node.config as Record<string, unknown>)
    .targetModuleId;
  return typeof targetModuleId === "string"
    ? { ...node.config, targetModuleId: namespacedId(targetModuleId) }
    : node.config;
}

function hydrateCameraComponent(
  node: StageComponentNode,
  config: CardConfig,
): StageComponentNode | undefined {
  if (node.componentType === TALK_COMPONENT_TYPE) {
    const cameras = config.cameras
      .filter(({ two_way_talk_enabled: enabled }) => enabled)
      .map(({ connection, entity_id: entityId }) => ({ connection, entityId }));
    return cameras.length ? { ...node, config: { cameras } } : undefined;
  }
  if (node.componentType === PTZ_COMPONENT_TYPE) {
    const cameras = config.cameras
      .filter(({ ptz_enabled: enabled }) => enabled)
      .map(({ connection: provider, entity_id: entityId }) => ({
        entityId,
        provider,
      }));
    return cameras.length ? { ...node, config: { cameras } } : undefined;
  }
  if (node.componentType === LIGHT_COMPONENT_TYPE) {
    const cameras = config.cameras
      .filter(({ lights }) => lights.length > 0)
      .map(({ entity_id: cameraEntityId, lights }) => ({
        cameraEntityId,
        lights: lights.map(({ entity_id: entityId, icon }) => ({
          entityId,
          ...(icon ? { icon } : {}),
        })),
      }));
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
