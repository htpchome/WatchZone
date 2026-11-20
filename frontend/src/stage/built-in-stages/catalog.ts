import type { CardConfig } from "../../core/config";
import { cameraPresentationItems } from "../../core/camera-groups";
import type { AvailableStageType } from "../../core/stage";
import {
  ACTIVITY_NAVIGATION_MODULE_TYPE,
  CAMERA_CONTROLS_MODULE_TYPE,
  APP_ID,
  REVIEWS_MODULE_TYPE,
  CAMERA_NAVIGATION_MODULE_TYPE,
  CAMERA_SWITCHER_COMPONENT_TYPE,
  SLIDESHOW_COMPONENT_TYPE,
  CAMERA_MODULE_TYPE,
  MINIMAL_CAMERA_MODULE_TYPE,
  EVENTS_MODULE_TYPE,
  EXPORTS_MODULE_TYPE,
  LIGHT_COMPONENT_TYPE,
  PTZ_COMPONENT_TYPE,
  RECORDINGS_MODULE_TYPE,
  TALK_COMPONENT_TYPE,
} from "../../core/constants";
import {
  validateStageDesign,
  type StageComponentNode,
  type StageContainerNode,
  type StageDesignDocument,
  type StageFlow,
  type StageModuleNode,
  type StagePlacement,
  type StageProfile,
  type StageStackNode,
  type StageSlotNode,
  type StageSurfaceNode,
  type StageVariant,
  type StageVariantName,
} from "../layout";
import defaultStageJson from "./default.json";
import defaultMobileStageJson from "./default_mobile.json";
import standardCameraStageJson from "./standard_camera.json";
import minimalCameraStageJson from "./minimal_camera.json";

export interface BuiltInStageSet {
  readonly designs: readonly StageDesignDocument[];
  readonly flow: StageFlow;
}

export interface BuiltInStageOption {
  readonly id: string;
  readonly name: string;
  readonly stageType: AvailableStageType;
}

const sourceTemplates = [
  validateStageDesign(defaultStageJson),
  validateStageDesign(defaultMobileStageJson),
  validateStageDesign(standardCameraStageJson),
  validateStageDesign(minimalCameraStageJson),
] as const;
const namespacedTemplates = sourceTemplates.map(namespaceTemplate);

export function builtInStageOptions(
  stageType: AvailableStageType,
  profile: StageVariantName,
): readonly BuiltInStageOption[] {
  const stageProfile: StageProfile =
    profile === "phone" ? "mobile" : "standard";
  return sourceTemplates
    .filter(
      (template) =>
        template.stageType === stageType &&
        template.profiles.includes(stageProfile),
    )
    .map(({ id, name }) => ({ id, name, stageType }));
}

/** Materializes immutable frontend templates with card-scoped runtime input. */
export function createBuiltInStageSet(config: CardConfig): BuiltInStageSet {
  const designs = namespacedTemplates
    .filter((template) => template.stageType === config.stage_type)
    .map((template) => hydrateTemplate(template, config));
  return {
    designs,
    flow: {
      default: config.stage_flow.default.map(namespacedId),
      phone: config.stage_flow.phone.map(namespacedId),
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
        children: variant.root.children
          .map(namespacePlacement)
          .sort(
            (left, right) =>
              left.grid.row - right.grid.row ||
              left.grid.column - right.grid.column,
          ),
        id: namespacedId(variant.root.id),
      },
    })),
  };
}

function namespacePlacement(placement: StagePlacement): StagePlacement {
  return {
    ...placement,
    node:
      placement.node.kind === "container"
        ? {
            ...placement.node,
            children: placement.node.children.map(namespacePlacement),
            id: namespacedId(placement.node.id),
          }
        : placement.node.kind === "stack"
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
              nodes?.map(namespaceSlotNode),
            ]),
          ),
        }
      : {}),
  };
}

function namespaceSlotNode(node: StageComponentNode | StageSurfaceNode) {
  if (node.kind === "surface") {
    return {
      ...node,
      children: node.children.map((component) => ({
        ...component,
        config: namespaceComponentConfig(component),
        id: namespacedId(component.id),
      })),
      id: namespacedId(node.id),
    };
  }
  return {
    ...node,
    config: namespaceComponentConfig(node),
    id: namespacedId(node.id),
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
  node: StageContainerNode | StageModuleNode | StageStackNode,
  config: CardConfig,
): StageContainerNode | StageModuleNode | StageStackNode | undefined {
  if (node.kind === "container") {
    const children = node.children.flatMap((placement) => {
      const hydrated = hydratePlacementNode(placement.node, config);
      return hydrated ? [{ ...placement, node: hydrated }] : [];
    });
    return children.length ? { ...node, children } : undefined;
  }
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
  if (
    node.moduleType === ACTIVITY_NAVIGATION_MODULE_TYPE &&
    config.cameras.length === 0
  ) {
    return undefined;
  }
  if (node.moduleType === CAMERA_NAVIGATION_MODULE_TYPE) {
    if (config.cameras.length === 0) return undefined;
    const moduleConfig =
      typeof node.config === "object" && node.config !== null
        ? node.config
        : {};
    return {
      ...node,
      config: {
        ...moduleConfig,
        roundedCorners: config.camera_bar_rounded_corners,
        shadows: config.camera_bar_shadows,
      },
    };
  }
  if (
    node.moduleType === EVENTS_MODULE_TYPE ||
    node.moduleType === REVIEWS_MODULE_TYPE ||
    node.moduleType === RECORDINGS_MODULE_TYPE ||
    node.moduleType === EXPORTS_MODULE_TYPE
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
        ...(node.moduleType !== RECORDINGS_MODULE_TYPE &&
        node.moduleType !== EXPORTS_MODULE_TYPE
          ? { historyDays: config.event_history_days }
          : {}),
        ...(node.moduleType !== RECORDINGS_MODULE_TYPE &&
        node.moduleType !== EXPORTS_MODULE_TYPE
          ? {
              displayEventTypeBadges: config.display_event_type_badges,
              displayObjectBadges: config.display_object_badges,
              displayZone: config.display_zone,
              roundedCorners: config.event_rounded_corners,
              shadows: config.event_shadows,
            }
          : {}),
        ...(node.moduleType === REVIEWS_MODULE_TYPE ||
        node.moduleType === EXPORTS_MODULE_TYPE
          ? {
              hoverPreviewEnabled: config.view_timelapse_on_thumbnail_hover,
            }
          : {}),
      },
    };
  }
  if (node.moduleType === CAMERA_CONTROLS_MODULE_TYPE) {
    if (config.cameras.length === 0) return undefined;
    const slots = Object.fromEntries(
      Object.entries(node.slots ?? {}).flatMap(([name, nodes]) => {
        const hydrated: StageSlotNode[] = [];
        for (const slotNode of nodes ?? []) {
          if (slotNode.kind === "component") {
            const component = hydrateCameraComponent(slotNode, config);
            if (component) hydrated.push(component);
            continue;
          }
          const children = slotNode.children.flatMap(
            (component: StageComponentNode) => {
              const hydratedComponent = hydrateCameraComponent(
                component,
                config,
              );
              return hydratedComponent ? [hydratedComponent] : [];
            },
          );
          if (children.length) hydrated.push({ ...slotNode, children });
        }
        return hydrated.length ? [[name, hydrated]] : [];
      }),
    );
    const content = slots.content;
    if (!Array.isArray(content) || content.length === 0) return undefined;
    const secondaryIds = groupedSecondaryIds(config);
    const talkCameras = config.cameras
      .filter(
        ({ entity_id: entityId, two_way_talk_enabled: enabled }) =>
          enabled && !secondaryIds.has(entityId),
      )
      .map(({ connection, entity_id: entityId }) => ({ connection, entityId }));
    const ptzCameras = config.cameras
      .filter(
        ({ entity_id: entityId, ptz_enabled: enabled }) =>
          enabled && !secondaryIds.has(entityId),
      )
      .map(({ connection: provider, entity_id: entityId }) => ({
        entityId,
        provider,
      }));
    return {
      ...node,
      config: {
        ...(typeof node.config === "object" && node.config !== null
          ? node.config
          : {}),
        talkCameras,
        ptzCameras,
      },
      slots,
    };
  }
  if (node.moduleType === MINIMAL_CAMERA_MODULE_TYPE) {
    const first = cameraPresentationItems(config.cameras)[0]?.cameras[0];
    if (!first) return undefined;
    return {
      ...node,
      config: {
        camera: {
          connection: first.connection,
          entityId: first.entity_id,
          frigateFallback: first.frigate_fallback,
          lowLatencyHls: first.low_latency_hls,
          startUnmutedPcTablet: first.start_live_unmuted_pc_tablet,
          startUnmutedPhone: first.start_live_unmuted_phone,
          title: first.title,
        },
        doubleTapAction: config.double_tap_action,
        highlightActivity: config.highlight_camera_on_activity,
        holdAction: config.hold_action,
        menuPosition: config.minimal_camera_menu_position,
        rotateAction: config.companion_rotate_action,
        showFullscreenButton: config.minimal_camera_show_fullscreen_button,
        showMuteButton: config.minimal_camera_show_mute_button,
        showPictureInPictureButton: config.minimal_camera_show_pip_button,
        showSourceLabel: config.minimal_camera_show_source_label,
        tapAction: config.tap_action,
      },
    };
  }
  if (node.moduleType !== CAMERA_MODULE_TYPE) return node;
  if (config.cameras.length === 0) return undefined;
  const slots = Object.fromEntries(
    Object.entries(node.slots ?? {}).flatMap(([name, components]) => {
      const hydrated = (components ?? []).flatMap(
        (component: StageComponentNode) => {
          const cameraComponent = hydrateCameraComponent(component, config);
          return cameraComponent ? [cameraComponent] : [];
        },
      );
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
      groups: cameraPresentationItems(config.cameras).flatMap((item) =>
        item.cameras.length === 2
          ? [
              {
                id: item.id,
                label: item.label,
                layout: item.layout,
                mainEntityId: item.cameras[0].entity_id,
                secondaryEntityId: item.cameras[1].entity_id,
              },
            ]
          : [],
      ),
      alertTakeoverMode: config.alert_detection_takeover,
      highlightActivity: config.highlight_camera_on_activity,
      retentionPreference: config.mobile_data_saving
        ? "reduced_bandwidth"
        : "automatic",
      roundedCorners: config.camera_rounded_corners,
      shadowStyle: config.camera_shadows ? "medium" : "none",
      transition: config.slide_transition,
      slideAdvanceSeconds: config.slide_advance_time,
      startAlertTakeoverOn: config.start_alert_takeover_on,
    },
    slots,
  };
}

function namespaceModuleConfig(node: StageModuleNode): unknown {
  if (node.moduleType === ACTIVITY_NAVIGATION_MODULE_TYPE) {
    if (typeof node.config !== "object" || node.config === null) {
      return node.config;
    }
    const targetStackId = (node.config as Record<string, unknown>)
      .targetStackId;
    return typeof targetStackId === "string"
      ? { ...node.config, targetStackId: namespacedId(targetStackId) }
      : node.config;
  }
  if (
    node.moduleType !== CAMERA_NAVIGATION_MODULE_TYPE &&
    node.moduleType !== CAMERA_CONTROLS_MODULE_TYPE &&
    node.moduleType !== EVENTS_MODULE_TYPE &&
    node.moduleType !== REVIEWS_MODULE_TYPE &&
    node.moduleType !== RECORDINGS_MODULE_TYPE &&
    node.moduleType !== EXPORTS_MODULE_TYPE
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

function namespaceComponentConfig(node: StageComponentNode): unknown {
  if (
    node.componentType !== CAMERA_SWITCHER_COMPONENT_TYPE &&
    node.componentType !== SLIDESHOW_COMPONENT_TYPE
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

function hydrateCameraComponent(
  node: StageComponentNode,
  config: CardConfig,
): StageComponentNode | undefined {
  if (node.componentType === CAMERA_SWITCHER_COMPONENT_TYPE) {
    return config.camera_switcher_overlay && config.cameras.length > 1
      ? node
      : undefined;
  }
  if (node.componentType === SLIDESHOW_COMPONENT_TYPE) {
    return config.cameras.length > 1 ? node : undefined;
  }
  if (node.componentType === TALK_COMPONENT_TYPE) {
    const secondaryIds = groupedSecondaryIds(config);
    const cameras = config.cameras
      .filter(
        ({ entity_id: entityId, two_way_talk_enabled: enabled }) =>
          enabled && !secondaryIds.has(entityId),
      )
      .map(({ connection, entity_id: entityId }) => ({ connection, entityId }));
    const componentConfig =
      typeof node.config === "object" && node.config !== null
        ? node.config
        : {};
    return cameras.length
      ? { ...node, config: { ...componentConfig, cameras } }
      : undefined;
  }
  if (node.componentType === PTZ_COMPONENT_TYPE) {
    const componentConfig =
      typeof node.config === "object" && node.config !== null
        ? node.config
        : {};
    const modulePresentation =
      (componentConfig as Record<string, unknown>).presentation === "module";
    if (!modulePresentation && config.ptz_overlay_control === "none") {
      return undefined;
    }
    const secondaryIds = groupedSecondaryIds(config);
    const cameras = config.cameras
      .filter(
        ({ entity_id: entityId, ptz_enabled: enabled }) =>
          enabled && !secondaryIds.has(entityId),
      )
      .map(({ connection: provider, entity_id: entityId }) => ({
        entityId,
        provider,
      }));
    return cameras.length
      ? {
          ...node,
          config: {
            ...componentConfig,
            cameras,
            initialState:
              config.ptz_overlay_control === "start_closed" ? "closed" : "open",
          },
        }
      : undefined;
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

function groupedSecondaryIds(config: CardConfig): ReadonlySet<string> {
  return new Set(
    config.cameras.flatMap(({ additional_camera: group }) =>
      group ? [group.entity_id] : [],
    ),
  );
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
