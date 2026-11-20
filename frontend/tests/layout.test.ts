import { render } from "lit";
import { describe, expect, it, vi } from "vitest";

import { createBuiltInStageSet } from "../src/stage/built-in-stages/catalog";
import { LayoutRuntime } from "../src/stage/layout-runtime";
import { PlaceableLoader } from "../src/stage/placeable-loader";
import { normalizeCardConfig } from "../src/core/config";
import {
  ACTIVITY_NAVIGATION_MODULE_TYPE,
  DEFAULT_ACTIVITY_NAVIGATION_MODULE_NODE_ID,
  DEFAULT_ACTIVITY_STACK_NODE_ID,
  DEFAULT_REVIEWS_MODULE_NODE_ID,
  DEFAULT_CAMERA_MODULE_NODE_ID,
  DEFAULT_CAMERA_NAVIGATION_MODULE_NODE_ID,
  DEFAULT_EXPORTS_MODULE_NODE_ID,
  DEFAULT_LAYOUT_ROOT_NODE_ID,
  DEFAULT_LIGHT_COMPONENT_NODE_ID,
  DEFAULT_PTZ_COMPONENT_NODE_ID,
  DEFAULT_PTZ_PANEL_COMPONENT_NODE_ID,
  DEFAULT_PTZ_PANEL_MODULE_NODE_ID,
  DEFAULT_RECORDINGS_MODULE_NODE_ID,
  DEFAULT_TALK_COMPONENT_NODE_ID,
  STANDARD_CAMERA_LAYOUT_ROOT_NODE_ID,
  STANDARD_CAMERA_MODULE_NODE_ID,
  STANDARD_LIGHT_COMPONENT_NODE_ID,
  STANDARD_PTZ_COMPONENT_NODE_ID,
  STANDARD_TALK_COMPONENT_NODE_ID,
} from "../src/core/constants";
import {
  validateStageCatalog,
  validateStageDesign,
  validateStageFlow,
  type StageContainerNode,
  type StageDesignDocument,
  type StageModuleNode,
  type StageStackNode,
  type StageVariant,
} from "../src/stage/layout";
import type { ModuleDefinition } from "../src/stage/placeable";

class RuntimeHost {
  public readonly controllers: Array<{
    hostConnected?(): void;
    hostDisconnected?(): void;
    hostUpdated?(): void;
  }> = [];
  public requestUpdate = vi.fn();
  public readonly updateComplete = Promise.resolve(true);

  public addController(controller: (typeof this.controllers)[number]): void {
    this.controllers.push(controller);
  }

  public removeController(controller: (typeof this.controllers)[number]): void {
    const index = this.controllers.indexOf(controller);
    if (index >= 0) this.controllers.splice(index, 1);
  }

  public connect(): void {
    for (const controller of this.controllers) controller.hostConnected?.();
  }

  public updated(): void {
    for (const controller of this.controllers) controller.hostUpdated?.();
  }
}

describe("layout composition", () => {
  it("builds an empty layout without a privileged camera node", () => {
    const layout = builtInStage(normalizeCardConfig({}));

    expect(defaultVariant(layout)).toEqual({
      root: {
        children: [],
        columns: 12,
        id: DEFAULT_LAYOUT_ROOT_NODE_ID,
        kind: "container",
        rows: ["content", "content"],
      },
    });
  });

  it("seeds a stable camera module node from the initial card input", () => {
    const layout = builtInStage(
      normalizeCardConfig({ camera_entity: "camera.front" }),
    );

    const children = defaultVariant(layout).root.children;
    expect(children).toHaveLength(4);
    expect(children[0].node).toMatchObject({
      id: DEFAULT_CAMERA_MODULE_NODE_ID,
      kind: "module",
      moduleType: "camera",
      config: {
        cameras: [{ entityId: "camera.front" }],
        roundedCorners: true,
        shadowStyle: "medium",
        retentionPreference: "automatic",
        transition: "slide",
      },
    });
    expect(
      children.find(
        ({ node }) =>
          node.kind === "module" &&
          node.id === DEFAULT_CAMERA_NAVIGATION_MODULE_NODE_ID,
      )?.node,
    ).toMatchObject({
      id: DEFAULT_CAMERA_NAVIGATION_MODULE_NODE_ID,
      kind: "module",
      moduleType: "camera-navigation",
      config: {
        roundedCorners: true,
        shadows: true,
        targetModuleId: DEFAULT_CAMERA_MODULE_NODE_ID,
      },
    });
    expect(
      children.find(({ node }) => node.id === DEFAULT_ACTIVITY_STACK_NODE_ID)
        ?.node,
    ).toMatchObject({
      id: DEFAULT_ACTIVITY_STACK_NODE_ID,
      kind: "stack",
      children: [
        {
          id: DEFAULT_REVIEWS_MODULE_NODE_ID,
          kind: "module",
          moduleType: "reviews",
        },
        {
          id: DEFAULT_RECORDINGS_MODULE_NODE_ID,
          kind: "module",
          moduleType: "recordings",
        },
        {
          id: DEFAULT_EXPORTS_MODULE_NODE_ID,
          kind: "module",
          moduleType: "exports",
        },
      ],
    });
    expect(
      children.find(
        ({ node }) =>
          node.kind === "module" &&
          node.id === DEFAULT_ACTIVITY_NAVIGATION_MODULE_NODE_ID,
      )?.node,
    ).toMatchObject({
      config: {
        presentation: "toolbar",
        targetStackId: DEFAULT_ACTIVITY_STACK_NODE_ID,
      },
      kind: "module",
      moduleType: ACTIVITY_NAVIGATION_MODULE_TYPE,
    });
    expect(activityModules(layout).map(({ config }) => config)).toEqual([
      {
        activityThumbnailOutlineMode: "both",
        displayEventTypeBadges: true,
        displayObjectBadges: true,
        displayZone: true,
        historyDays: 5,
        hoverPreviewEnabled: true,
        roundedCorners: true,
        shadows: true,
        targetModuleId: DEFAULT_CAMERA_MODULE_NODE_ID,
      },
      {
        targetModuleId: DEFAULT_CAMERA_MODULE_NODE_ID,
      },
      {
        hoverPreviewEnabled: true,
        targetModuleId: DEFAULT_CAMERA_MODULE_NODE_ID,
      },
    ]);
  });

  it("omits Events from every built-in Full Stage variant", () => {
    const stageSet = createBuiltInStageSet(
      normalizeCardConfig({ camera_entity: "camera.front" }),
    );

    for (const design of stageSet.designs) {
      for (const variant of Object.values(design.variants)) {
        expect(variant && collectModuleTypes(variant.root)).not.toContain(
          "events",
        );
      }
    }
  });

  it("gates the camera-only flow to the standard camera design", () => {
    const stageSet = createBuiltInStageSet(
      normalizeCardConfig({
        cameras: [
          {
            entity_id: "camera.front",
            lights: [{ entity_id: "light.porch" }],
            ptz_enabled: true,
            two_way_talk_enabled: true,
          },
        ],
        stage_type: "camera_only",
      }),
    );
    expect(stageSet.designs).toHaveLength(1);
    expect(stageSet.flow).toEqual({
      default: ["wzc:standard-camera-stage"],
      phone: ["wzc:standard-camera-stage"],
    });
    const design = stageSet.designs[0];
    expect(design?.stageType).toBe("camera_only");
    const root = design && defaultVariant(design).root;
    expect(root).toMatchObject({
      id: STANDARD_CAMERA_LAYOUT_ROOT_NODE_ID,
      rows: ["fraction"],
    });
    expect(root?.children).toHaveLength(1);
    const camera = root?.children[0]?.node;
    expect(camera).toMatchObject({
      id: STANDARD_CAMERA_MODULE_NODE_ID,
      kind: "module",
      moduleType: "camera",
    });
    if (!camera || camera.kind !== "module") {
      throw new Error("Expected the standard camera module.");
    }
    expect(camera.slots?.controls?.map(({ id }) => id)).toEqual([
      STANDARD_LIGHT_COMPONENT_NODE_ID,
      STANDARD_TALK_COMPONENT_NODE_ID,
      STANDARD_PTZ_COMPONENT_NODE_ID,
    ]);
  });

  it("hydrates the minimal stage with only the first presentation item's main camera", () => {
    const stageSet = createBuiltInStageSet(
      normalizeCardConfig({
        cameras: [
          {
            additional_camera: {
              entity_id: "camera.porch",
              layout: "side_by_side",
            },
            entity_id: "camera.doorbell",
            title: "Doorbell",
          },
          { entity_id: "camera.porch", title: "Porch" },
          { entity_id: "camera.driveway", title: "Driveway" },
        ],
        stage_type: "minimal_camera_only",
      }),
    );

    expect(stageSet.flow).toEqual({
      default: ["wzc:minimal-camera-stage"],
      phone: ["wzc:minimal-camera-stage"],
    });
    expect(stageSet.designs).toHaveLength(1);
    const module = moduleAt(stageSet.designs[0]!, 0);
    expect(module).toMatchObject({
      moduleType: "minimal_camera",
      config: {
        camera: { entityId: "camera.doorbell", title: "" },
        doubleTapAction: { action: "none" },
        holdAction: { action: "none" },
        menuPosition: "top_left",
        tapAction: { action: "open-live-view" },
      },
    });
  });

  it("hydrates the configured carousel transition into the camera module", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        cameras: [{ entity_id: "camera.front" }],
        slide_transition: "fade",
      }),
    );

    expect(moduleAt(layout, 0).config).toMatchObject({ transition: "fade" });
  });

  it("maps event badge visibility at the reviews module boundary", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        camera_entity: "camera.front",
        display_event_type_badges: false,
        display_object_badges: false,
        display_zone: false,
      }),
    );

    for (const module of reviewModules(layout)) {
      expect(module.config).toMatchObject({
        displayEventTypeBadges: false,
        displayObjectBadges: false,
        displayZone: false,
      });
    }
  });

  it("maps the configured event history range at the reviews module boundary", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        camera_entity: "camera.front",
        event_history_days: 12,
      }),
    );

    for (const module of reviewModules(layout)) {
      expect(module.config).toMatchObject({ historyDays: 12 });
    }
    expect(
      activityModuleOfType(layout, "recordings").config,
    ).not.toHaveProperty("historyDays");
  });

  it("maps camera bar appearance at the navigation module boundary", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        camera_entity: "camera.front",
        camera_bar_rounded_corners: false,
        camera_bar_shadows: false,
      }),
    );
    const navigation = moduleOfType(layout, "camera-navigation");
    expect(navigation.config).toMatchObject({
      roundedCorners: false,
      shadows: false,
      targetModuleId: DEFAULT_CAMERA_MODULE_NODE_ID,
    });
  });

  it("keeps slideshow independent from the optional camera switcher overlay", () => {
    const switcherDisabled = builtInStage(
      normalizeCardConfig({
        cameras: [{ entity_id: "camera.front" }, { entity_id: "camera.back" }],
      }),
    );
    expect(moduleAt(switcherDisabled, 0).slots?.overlay).toEqual([
      expect.objectContaining({
        componentType: "slideshow",
        config: { targetModuleId: DEFAULT_CAMERA_MODULE_NODE_ID },
        kind: "component",
        overlayRegion: "top",
      }),
    ]);

    const switcherEnabled = builtInStage(
      normalizeCardConfig({
        camera_switcher_overlay: true,
        cameras: [{ entity_id: "camera.front" }, { entity_id: "camera.back" }],
      }),
    );
    expect(moduleAt(switcherEnabled, 0).slots?.overlay).toEqual([
      expect.objectContaining({
        componentType: "slideshow",
        config: { targetModuleId: DEFAULT_CAMERA_MODULE_NODE_ID },
        kind: "component",
        overlayRegion: "top",
      }),
      expect.objectContaining({
        componentType: "camera_switcher",
        config: { targetModuleId: DEFAULT_CAMERA_MODULE_NODE_ID },
        kind: "component",
        overlayRegion: "top",
      }),
    ]);
  });

  it("maps event shadows at the reviews module boundary", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        camera_entity: "camera.front",
        event_shadows: false,
      }),
    );
    for (const module of reviewModules(layout)) {
      expect(module.config).toMatchObject({ shadows: false });
    }
  });

  it("maps camera appearance once at the camera module boundary", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        camera_entity: "camera.front",
        camera_rounded_corners: false,
        camera_shadows: false,
      }),
    );
    const cameraNode = moduleAt(layout, 0);

    expect(cameraNode.config).toMatchObject({
      cameras: [{ entityId: "camera.front" }],
      roundedCorners: false,
      shadowStyle: "none",
    });
    expect(
      (cameraNode.config as { cameras: readonly unknown[] }).cameras[0],
    ).not.toHaveProperty("roundedCorners");
  });

  it("composes independent talk controls in the wide activity toolbar", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        cameras: [
          { entity_id: "camera.front", two_way_talk_enabled: true },
          { entity_id: "camera.back" },
        ],
      }),
    );

    const navigation = moduleOfType(layout, ACTIVITY_NAVIGATION_MODULE_TYPE);
    expect(navigation.slots?.content).toHaveLength(1);
    expect(navigation.slots?.content?.[0]).toMatchObject({
      id: DEFAULT_TALK_COMPONENT_NODE_ID,
      kind: "component",
      componentType: "two_way_talk",
      config: {
        cameras: [{ connection: "home_assistant", entityId: "camera.front" }],
        presentation: "standard",
      },
    });
  });

  it("composes linked lights in the wide activity toolbar", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        cameras: [
          {
            entity_id: "camera.front",
            lights: [
              { entity_id: "light.porch", icon: "mdi:coach-lamp" },
              { entity_id: "light.driveway" },
            ],
          },
          {
            entity_id: "camera.back",
            lights: [{ entity_id: "light.yard" }],
          },
        ],
      }),
    );

    const navigation = moduleOfType(layout, ACTIVITY_NAVIGATION_MODULE_TYPE);
    expect(navigation.slots?.content?.[0]).toMatchObject({
      id: DEFAULT_LIGHT_COMPONENT_NODE_ID,
      kind: "component",
      componentType: "light_control",
      config: {
        cameras: [
          {
            cameraEntityId: "camera.front",
            lights: [
              { entityId: "light.porch", icon: "mdi:coach-lamp" },
              { entityId: "light.driveway" },
            ],
          },
          {
            cameraEntityId: "camera.back",
            lights: [{ entityId: "light.yard" }],
          },
        ],
        presentation: "standard",
      },
    });
  });

  it("moves light and talk components at the canonical 600px Stage variant", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        cameras: [
          {
            entity_id: "camera.front",
            lights: [{ entity_id: "light.porch" }],
            two_way_talk_enabled: true,
          },
        ],
      }),
    );
    const wideNavigation = moduleOfType(
      layout,
      ACTIVITY_NAVIGATION_MODULE_TYPE,
    );
    expect(
      wideNavigation.slots?.content?.map(({ componentType, config, id }) => ({
        componentType,
        config,
        id,
      })),
    ).toMatchObject([
      {
        componentType: "light_control",
        config: { presentation: "standard" },
        id: DEFAULT_LIGHT_COMPONENT_NODE_ID,
      },
      {
        componentType: "two_way_talk",
        config: { presentation: "standard" },
        id: DEFAULT_TALK_COMPONENT_NODE_ID,
      },
    ]);

    const phone = layout.variants.phone;
    if (!phone) throw new Error("Expected the built-in phone variant.");
    const phoneCamera = findModule(phone.root, "camera");
    const phoneNavigation = findModule(
      phone.root,
      ACTIVITY_NAVIGATION_MODULE_TYPE,
    );
    expect(phoneNavigation.slots?.content).toBeUndefined();
    expect(
      phoneCamera.slots?.controls?.map(({ componentType, config, id }) => ({
        componentType,
        config,
        id,
      })),
    ).toMatchObject([
      {
        componentType: "light_control",
        config: { presentation: "overlay" },
        id: DEFAULT_LIGHT_COMPONENT_NODE_ID,
      },
      {
        componentType: "two_way_talk",
        config: { presentation: "overlay" },
        id: DEFAULT_TALK_COMPONENT_NODE_ID,
      },
    ]);
  });

  it("composes provider-resolved PTZ in the trailing controls region", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        cameras: [
          { entity_id: "camera.front", ptz_enabled: true },
          {
            connection: "frigate_go2rtc",
            entity_id: "camera.back",
            ptz_enabled: true,
          },
        ],
      }),
    );

    const camera = moduleAt(layout, 0);
    expect(camera?.slots?.overlay).toEqual([
      expect.objectContaining({ componentType: "slideshow" }),
    ]);
    expect(camera?.slots?.controls?.[0]).toMatchObject({
      id: DEFAULT_PTZ_COMPONENT_NODE_ID,
      kind: "component",
      componentType: "ptz",
      controlRegion: "trailing",
      config: {
        cameras: [
          { entityId: "camera.front", provider: "home_assistant" },
          { entityId: "camera.back", provider: "frigate_go2rtc" },
        ],
        initialState: "open",
      },
    });
    const panel = activityModules(layout).find(
      ({ id }) => id === DEFAULT_PTZ_PANEL_MODULE_NODE_ID,
    );
    expect(panel).toMatchObject({
      id: DEFAULT_PTZ_PANEL_MODULE_NODE_ID,
      kind: "module",
      moduleType: "ptz-panel",
      config: {
        cameraEntityIds: ["camera.front", "camera.back"],
        targetModuleId: DEFAULT_CAMERA_MODULE_NODE_ID,
      },
    });
    expect(panel?.slots?.content?.[0]).toMatchObject({
      id: DEFAULT_PTZ_PANEL_COMPONENT_NODE_ID,
      componentType: "ptz",
      config: {
        cameras: [
          { entityId: "camera.front", provider: "home_assistant" },
          { entityId: "camera.back", provider: "frigate_go2rtc" },
        ],
        initialState: "open",
        presentation: "panel",
      },
    });
  });

  it("hydrates grouped cameras while keeping talk and PTZ on the main camera", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        cameras: [
          {
            additional_camera: {
              entity_id: "camera.driveway",
              layout: "side_by_side",
            },
            entity_id: "camera.porch",
            title: "Group A/B",
            lights: [{ entity_id: "light.porch" }],
            ptz_enabled: true,
            two_way_talk_enabled: true,
          },
          { entity_id: "camera.driveway" },
        ],
      }),
    );
    const camera = moduleAt(layout, 0);
    const navigation = moduleOfType(layout, ACTIVITY_NAVIGATION_MODULE_TYPE);

    expect(camera.config).toMatchObject({
      groups: [
        {
          id: "camera.porch",
          label: "Group A/B",
          layout: "side_by_side",
          mainEntityId: "camera.porch",
          secondaryEntityId: "camera.driveway",
        },
      ],
    });
    expect(
      navigation.slots?.content?.find(
        ({ componentType }) => componentType === "two_way_talk",
      )?.config,
    ).toEqual({
      cameras: [{ connection: "home_assistant", entityId: "camera.porch" }],
      presentation: "standard",
    });
    expect(
      camera.slots?.controls?.find(
        ({ componentType }) => componentType === "ptz",
      )?.config,
    ).toMatchObject({
      cameras: [{ entityId: "camera.porch", provider: "home_assistant" }],
    });
    expect(
      navigation.slots?.content?.find(
        ({ componentType }) => componentType === "light_control",
      )?.config,
    ).toMatchObject({
      cameras: [
        {
          cameraEntityId: "camera.porch",
          lights: [{ entityId: "light.porch" }],
        },
      ],
    });
  });

  it("uses the configured PTZ reset state and removes a disabled overlay", () => {
    const closedLayout = builtInStage(
      normalizeCardConfig({
        cameras: [{ entity_id: "camera.front", ptz_enabled: true }],
        ptz_overlay_control: "start_closed",
      }),
    );
    const closedCamera = moduleAt(closedLayout, 0);
    expect(closedCamera.slots?.controls?.[0]?.config).toMatchObject({
      initialState: "closed",
    });

    const hiddenLayout = builtInStage(
      normalizeCardConfig({
        cameras: [{ entity_id: "camera.front", ptz_enabled: true }],
        ptz_overlay_control: "none",
      }),
    );
    const hiddenCamera = moduleAt(hiddenLayout, 0);
    expect(
      hiddenCamera.slots?.controls?.some(
        ({ componentType }) => componentType === "ptz",
      ) ?? false,
    ).toBe(false);
  });

  it("rejects duplicate stable node IDs", () => {
    expect(() => validateStageDesign(stageWithNodes("same", "same"))).toThrow(
      "Invalid Stage: node.duplicate:same",
    );
  });

  it("keeps physical-client profiles independent from responsive variants", () => {
    const mobile = {
      ...layoutWithModules("phone-node"),
      id: "phone-stage",
      profiles: ["mobile"],
    } as const;

    expect(validateStageDesign(mobile).profiles).toEqual(["mobile"]);
    expect(validateStageDesign(mobile).variants.default).toBeDefined();
    expect(validateStageDesign(mobile).variants.phone).toBeDefined();
    expect(() =>
      validateStageDesign({ ...layoutWithModules("node"), variants: {} }),
    ).toThrow("Invalid Stage: variants.empty");
    expect(() =>
      validateStageDesign({ ...layoutWithModules("node"), profiles: [] }),
    ).toThrow("Invalid Stage: profiles");
  });

  it("validates ordered standard and mobile flows against eligibility", () => {
    const shared = layoutWithModules("shared-node");
    const mobile = {
      ...layoutWithModules("phone-node"),
      id: "phone-stage",
      profiles: ["mobile"],
    } as const;
    const catalog = validateStageCatalog([shared, mobile]);

    expect(
      validateStageFlow(
        {
          default: [shared.id],
          phone: [mobile.id, shared.id],
        },
        catalog,
      ),
    ).toEqual({
      default: [shared.id],
      phone: [mobile.id, shared.id],
    });
    expect(() =>
      validateStageFlow({ default: [mobile.id], phone: [shared.id] }, catalog),
    ).toThrow(`Invalid Stage: flow.profile:${mobile.id}`);
  });

  it("lands on the first flow entry and selects another validated stage", () => {
    const first = { ...layoutWithModules("first-node"), id: "first-stage" };
    const second = { ...layoutWithModules("second-node"), id: "second-stage" };
    const runtime = new LayoutRuntime(new RuntimeHost());
    const container = document.createElement("div");

    runtime.setStageSet([first, second], {
      default: [first.id, second.id],
      phone: [second.id, first.id],
    });
    render(runtime.render(), container);
    expect(
      container.querySelector(".stage-grid")?.getAttribute("data-stage-design"),
    ).toBe(first.id);

    expect(runtime.showStage(second.id)).toBe(true);
    render(runtime.render(), container);
    expect(
      container.querySelector(".stage-grid")?.getAttribute("data-stage-design"),
    ).toBe(second.id);

    runtime.setFlowProfile("phone");
    render(runtime.render(), container);
    expect(
      container.querySelector(".stage-grid")?.getAttribute("data-stage-design"),
    ).toBe(second.id);
    runtime.setInlineSize(500);
    render(runtime.render(), container);
    expect(
      container.querySelector(".stage-grid")?.getAttribute("data-stage-design"),
    ).toBe(second.id);
    expect(runtime.showStage(first.id)).toBe(true);
    runtime.setFlowProfile("default");
    render(runtime.render(), container);
    expect(
      container.querySelector(".stage-grid")?.getAttribute("data-stage-design"),
    ).toBe(second.id);
    expect(runtime.showStage("missing-stage")).toBe(false);
  });

  it("loads referenced module types once and preserves elements by node ID", async () => {
    const load = vi.fn();
    const definition: ModuleDefinition<Record<string, string>> = {
      type: "test",
      createElement: () => document.createElement("article"),
      define: async () => undefined,
      getEntityIds: () => [],
      updateElement: (element, config) => {
        element.dataset.value = config.value;
      },
      validateConfig: (value) => value as Record<string, string>,
    };
    load.mockResolvedValue(definition);
    const loader = new PlaceableLoader({ test: { load } });
    const host = new RuntimeHost();
    const runtime = new LayoutRuntime(host, loader);
    const container = document.createElement("div");
    host.connect();
    setRuntimeStage(runtime, layoutWithModules("first", "second"));
    await vi.waitFor(() => {
      render(runtime.render(), container);
      expect(container.querySelectorAll("article")).toHaveLength(2);
    });
    host.updated();
    const before = [...container.querySelectorAll("article")];

    setRuntimeStage(runtime, layoutWithModules("second", "first"));
    render(runtime.render(), container);
    const after = [...container.querySelectorAll("article")];

    expect(load).toHaveBeenCalledOnce();
    expect(before).toHaveLength(2);
    expect(after).toEqual([before[1], before[0]]);
    expect(after.map(({ dataset }) => dataset.value)).toEqual([
      "second",
      "first",
    ]);
  });

  it("shows one stacked module at a time and preserves visited elements", async () => {
    const createDefinition = (type: string): ModuleDefinition<unknown> => ({
      type,
      createElement: () => {
        const element = document.createElement("article");
        element.dataset.type = type;
        return element;
      },
      define: async () => undefined,
      getEntityIds: () => [],
      updateElement: () => undefined,
      validateConfig: (value) => value,
    });
    const reviewsLoad = vi.fn(async () => createDefinition("reviews"));
    const eventsLoad = vi.fn(async () => createDefinition("events"));
    const navigationDefinition: ModuleDefinition<
      { targetStackId: string },
      "moduleStackNavigation"
    > = {
      contextKeys: ["moduleStackNavigation"],
      type: ACTIVITY_NAVIGATION_MODULE_TYPE,
      createElement: () => {
        const navigation = document.createElement("nav");
        navigation.className = "stage-stack-navigation";
        navigation.append(
          document.createElement("button"),
          document.createElement("button"),
        );
        return navigation;
      },
      define: async () => undefined,
      getEntityIds: () => [],
      updateElement: (element, config, context) => {
        const buttons = element.querySelectorAll("button");
        buttons[0]!.onclick = () =>
          context.moduleStackNavigation.select(
            config.targetStackId,
            "reviews-node",
          );
        buttons[1]!.onclick = () =>
          context.moduleStackNavigation.select(
            config.targetStackId,
            "events-node",
          );
      },
      validateConfig: (value) => value as { targetStackId: string },
    };
    const loader = new PlaceableLoader({
      [ACTIVITY_NAVIGATION_MODULE_TYPE]: {
        load: async () => navigationDefinition,
      },
      reviews: {
        load: reviewsLoad,
        navigation: { icon: "reviews", labelKey: "navigation.reviews" },
      },
      events: {
        load: eventsLoad,
        navigation: { icon: "events", labelKey: "navigation.events" },
      },
    });
    const host = new RuntimeHost();
    const runtime = new LayoutRuntime(host, loader);
    const container = document.createElement("div");
    host.connect();
    setRuntimeStage(runtime, layoutWithStack());

    await vi.waitFor(() => {
      render(runtime.render(), container);
      expect(container.querySelector("article")?.dataset.type).toBe("reviews");
    });
    const reviews = container.querySelector("article");
    expect(reviewsLoad).toHaveBeenCalledOnce();
    expect(eventsLoad).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      render(runtime.render(), container);
      expect(container.querySelector(".stage-stack-navigation")).toBeTruthy();
    });
    const navigation = container.querySelector(".stage-stack-navigation");
    expect(navigation?.querySelectorAll("button")).toHaveLength(2);
    navigation?.querySelectorAll("button")[1]?.click();
    await vi.waitFor(() => {
      render(runtime.render(), container);
      expect(container.querySelector("article")?.dataset.type).toBe("events");
    });
    expect(reviews?.isConnected).toBe(false);
    expect(eventsLoad).toHaveBeenCalledOnce();

    navigation?.querySelectorAll("button")[0]?.click();
    render(runtime.render(), container);
    expect(container.querySelector("article")).toBe(reviews);
    expect(reviewsLoad).toHaveBeenCalledOnce();
  });

  it("prepares a module while its visual definition loads and releases after mount", async () => {
    let finishDefinition: (() => void) | undefined;
    const definitionReady = new Promise<void>((resolve) => {
      finishDefinition = resolve;
    });
    const release = vi.fn();
    const prepare = vi.fn(async () => ({ release }));
    const definition: ModuleDefinition<Record<string, string>> = {
      type: "test",
      createElement: () => document.createElement("article"),
      define: () => definitionReady,
      getEntityIds: () => [],
      prepare,
      updateElement: () => undefined,
      validateConfig: (value) => value as Record<string, string>,
    };
    const loader = new PlaceableLoader({
      test: { load: async () => definition },
    });
    const host = new RuntimeHost();
    const runtime = new LayoutRuntime(host, loader);
    const container = document.createElement("div");
    document.body.append(container);
    host.connect();
    setRuntimeStage(runtime, layoutWithModules("only"));

    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    expect(container.querySelector("article")).toBeNull();
    finishDefinition?.();
    await vi.waitFor(() => {
      render(runtime.render(), container);
      expect(container.querySelector("article")).not.toBeNull();
    });
    host.updated();

    expect(release).toHaveBeenCalledOnce();
    container.remove();
  });

  it("reports invalid placeables through the toast boundary without inline errors", async () => {
    const showError = vi.fn();
    const definition: ModuleDefinition<unknown> = {
      type: "test",
      createElement: () => document.createElement("article"),
      define: async () => undefined,
      getEntityIds: () => [],
      updateElement: () => undefined,
      validateConfig: () => {
        throw new Error("Internal validation detail");
      },
    };
    const loader = new PlaceableLoader({
      test: { load: async () => definition },
    });
    const host = new RuntimeHost();
    const runtime = new LayoutRuntime(host, loader, loader, showError);
    const container = document.createElement("div");
    host.connect();
    setRuntimeStage(runtime, layoutWithModules("invalid"));

    await vi.waitFor(() => expect(showError).toHaveBeenCalledOnce());
    render(runtime.render(), container);

    expect(showError).toHaveBeenCalledWith(
      "Unable to load this module.",
      "layout-placeable-invalid",
    );
    expect(container.querySelector("[role=alert]")).toBeNull();
    expect(container.querySelector(".module-error")).toBeNull();
    expect(container.textContent).not.toContain("Internal validation detail");
  });
});

function builtInStage(config: ReturnType<typeof normalizeCardConfig>) {
  const stage = createBuiltInStageSet(config).designs[0];
  if (!stage) throw new Error("Expected the built-in stage.");
  return stage;
}

function defaultVariant(design: StageDesignDocument): StageVariant {
  const variant = design.variants.default;
  if (!variant) throw new Error("Expected a default stage variant.");
  return variant;
}

function moduleAt(design: StageDesignDocument, index: number): StageModuleNode {
  const node = defaultVariant(design).root.children[index]?.node;
  if (!node || node.kind !== "module") {
    throw new Error(`Expected module at placement ${index}.`);
  }
  return node;
}

function moduleOfType(
  design: StageDesignDocument,
  moduleType: string,
): StageModuleNode {
  const node = defaultVariant(design).root.children.find(
    ({ node }) => node.kind === "module" && node.moduleType === moduleType,
  )?.node;
  if (!node || node.kind !== "module") {
    throw new Error(`Expected ${moduleType} module.`);
  }
  return node;
}

function activityModules(
  design: StageDesignDocument,
): readonly StageModuleNode[] {
  const node = defaultVariant(design).root.children.find(
    ({ node }) => node.kind === "stack",
  )?.node;
  if (!node || node.kind !== "stack") {
    throw new Error("Expected the built-in activity stack.");
  }
  return (node as StageStackNode).children;
}

function activityModuleOfType(
  design: StageDesignDocument,
  moduleType: string,
): StageModuleNode {
  const module = activityModules(design).find(
    (candidate) => candidate.moduleType === moduleType,
  );
  if (!module) throw new Error(`Expected ${moduleType} activity module.`);
  return module;
}

function reviewModules(
  design: StageDesignDocument,
): readonly StageModuleNode[] {
  return activityModules(design).filter(
    ({ moduleType }) => moduleType === "reviews",
  );
}

function collectModuleTypes(container: StageContainerNode): string[] {
  return container.children.flatMap(({ node }) => {
    if (node.kind === "container") return collectModuleTypes(node);
    if (node.kind === "stack")
      return node.children.map(({ moduleType }) => moduleType);
    return [node.moduleType];
  });
}

function findModule(
  container: StageContainerNode,
  moduleType: string,
): StageModuleNode {
  for (const { node } of container.children) {
    if (node.kind === "module" && node.moduleType === moduleType) return node;
    if (node.kind === "container") {
      try {
        return findModule(node, moduleType);
      } catch {
        // Continue searching sibling containers.
      }
    }
  }
  throw new Error(`Expected ${moduleType} module.`);
}

function setRuntimeStage(
  runtime: LayoutRuntime,
  design: StageDesignDocument,
): void {
  runtime.setStageSet([design], {
    default: [design.id],
    phone: [design.id],
  });
}

function layoutWithModules(...ids: string[]): StageDesignDocument {
  return {
    id: "test-stage",
    name: "Test",
    profiles: ["standard", "mobile"],
    revision: 0,
    schemaVersion: 4,
    stageType: "full",
    variants: {
      default: variantWithNodes(...ids),
      phone: variantWithNodes(...ids),
    },
  };
}

function layoutWithStack(): StageDesignDocument {
  const variant: StageVariant = {
    root: {
      children: [
        {
          grid: { column: 1, columnSpan: 12, row: 1, rowSpan: 1 },
          node: {
            config: {
              presentation: "toolbar",
              targetStackId: "activity-stack",
            },
            id: "activity-navigation",
            kind: "module",
            moduleType: ACTIVITY_NAVIGATION_MODULE_TYPE,
          },
        },
        {
          grid: { column: 1, columnSpan: 12, row: 2, rowSpan: 1 },
          node: {
            children: [
              {
                config: {},
                id: "reviews-node",
                kind: "module",
                moduleType: "reviews",
              },
              {
                config: {},
                id: "events-node",
                kind: "module",
                moduleType: "events",
              },
            ],
            id: "activity-stack",
            kind: "stack",
          },
        },
      ],
      columns: 12,
      id: "root",
      kind: "container",
      rows: ["content", "fraction"],
    },
  };
  return {
    id: "stack-stage",
    name: "Stack",
    profiles: ["standard", "mobile"],
    revision: 0,
    schemaVersion: 4,
    stageType: "full",
    variants: { default: variant, phone: variant },
  };
}

function stageWithNodes(...ids: string[]) {
  return layoutWithModules(...ids);
}

function variantWithNodes(...ids: string[]): StageVariant {
  return {
    root: {
      children: ids.map((id, index) => ({
        grid: { column: 1, columnSpan: 12, row: index + 1, rowSpan: 1 },
        node: {
          config: { value: id },
          id,
          kind: "module",
          moduleType: "test",
        },
      })),
      columns: 12,
      id: "root",
      kind: "container",
      rows: ids.map(() => "fraction" as const),
    },
  };
}
