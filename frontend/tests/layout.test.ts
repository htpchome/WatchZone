import { render } from "lit";
import { describe, expect, it, vi } from "vitest";

import { createBuiltInStageSet } from "../src/stage/built-in-stages/catalog";
import { LayoutRuntime } from "../src/stage/layout-runtime";
import { PlaceableLoader } from "../src/stage/placeable-loader";
import { normalizeCardConfig } from "../src/core/config";
import {
  DEFAULT_ACTIVITY_STACK_NODE_ID,
  DEFAULT_ALERTS_MODULE_NODE_ID,
  DEFAULT_CAMERA_MODULE_NODE_ID,
  DEFAULT_CAMERA_NAVIGATION_COMPONENT_NODE_ID,
  DEFAULT_EVENTS_MODULE_NODE_ID,
  DEFAULT_LAYOUT_ROOT_NODE_ID,
  DEFAULT_LIGHT_COMPONENT_NODE_ID,
  DEFAULT_PANEL_MODULE_NODE_ID,
  DEFAULT_PTZ_COMPONENT_NODE_ID,
  DEFAULT_RECORDINGS_MODULE_NODE_ID,
  DEFAULT_TALK_COMPONENT_NODE_ID,
} from "../src/core/constants";
import {
  validateStageCatalog,
  validateStageDesign,
  validateStageFlow,
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
        rows: ["fraction", "content"],
      },
    });
  });

  it("seeds a stable camera module node from the initial card input", () => {
    const layout = builtInStage(
      normalizeCardConfig({ camera_entity: "camera.front" }),
    );

    const children = defaultVariant(layout).root.children;
    expect(children).toHaveLength(3);
    expect(children[0].node).toMatchObject({
      id: DEFAULT_CAMERA_MODULE_NODE_ID,
      kind: "module",
      moduleType: "camera",
      config: {
        cameras: [{ entityId: "camera.front" }],
        roundedCorners: true,
        shadowStyle: "medium",
        retentionPreference: "automatic",
      },
    });
    expect(children[1].node).toMatchObject({
      id: DEFAULT_PANEL_MODULE_NODE_ID,
      kind: "module",
      moduleType: "panel",
      slots: {
        content: [
          {
            componentType: "camera_navigation",
            config: {
              roundedCorners: true,
              shadows: true,
              targetModuleId: DEFAULT_CAMERA_MODULE_NODE_ID,
            },
            id: DEFAULT_CAMERA_NAVIGATION_COMPONENT_NODE_ID,
            kind: "component",
          },
        ],
      },
    });
    expect(children[2].node).toMatchObject({
      id: DEFAULT_ACTIVITY_STACK_NODE_ID,
      kind: "stack",
      children: [
        {
          id: DEFAULT_ALERTS_MODULE_NODE_ID,
          kind: "module",
          moduleType: "alerts",
        },
        {
          id: DEFAULT_EVENTS_MODULE_NODE_ID,
          kind: "module",
          moduleType: "events",
        },
        {
          id: DEFAULT_RECORDINGS_MODULE_NODE_ID,
          kind: "module",
          moduleType: "recordings",
        },
      ],
    });
    expect(activityModules(layout).map(({ config }) => config)).toEqual([
      {
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
        displayEventTypeBadges: true,
        displayObjectBadges: true,
        displayZone: true,
        historyDays: 5,
        roundedCorners: true,
        shadows: true,
        targetModuleId: DEFAULT_CAMERA_MODULE_NODE_ID,
      },
      {
        historyDays: 5,
        targetModuleId: DEFAULT_CAMERA_MODULE_NODE_ID,
      },
    ]);
  });

  it("maps event badge visibility at the events module boundary", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        camera_entity: "camera.front",
        display_event_type_badges: false,
        display_object_badges: false,
        display_zone: false,
      }),
    );

    for (const module of alertEventModules(layout)) {
      expect(module.config).toMatchObject({
        displayEventTypeBadges: false,
        displayObjectBadges: false,
        displayZone: false,
      });
    }
  });

  it("maps the configured event history range at the events module boundary", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        camera_entity: "camera.front",
        event_history_days: 12,
      }),
    );

    for (const module of activityModules(layout)) {
      expect(module.config).toMatchObject({ historyDays: 12 });
    }
  });

  it("maps camera bar appearance at the navigation component boundary", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        camera_entity: "camera.front",
        camera_bar_rounded_corners: false,
        camera_bar_shadows: false,
      }),
    );
    const panel = moduleAt(layout, 1);
    expect(panel?.slots?.content?.[0]?.config).toMatchObject({
      roundedCorners: false,
      shadows: false,
      targetModuleId: DEFAULT_CAMERA_MODULE_NODE_ID,
    });
  });

  it("maps event shadows at both activity module boundaries", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        camera_entity: "camera.front",
        event_shadows: false,
      }),
    );
    for (const module of alertEventModules(layout)) {
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

  it("composes independent talk controls only for opted-in cameras", () => {
    const layout = builtInStage(
      normalizeCardConfig({
        cameras: [
          { entity_id: "camera.front", two_way_talk_enabled: true },
          { entity_id: "camera.back" },
        ],
      }),
    );

    const camera = moduleAt(layout, 0);
    expect(camera?.slots?.controls).toHaveLength(1);
    expect(camera?.slots?.controls?.[0]).toMatchObject({
      id: DEFAULT_TALK_COMPONENT_NODE_ID,
      kind: "component",
      componentType: "two_way_talk",
      controlRegion: "center",
      config: {
        cameras: [{ connection: "home_assistant", entityId: "camera.front" }],
      },
    });
  });

  it("composes linked lights in the responsive controls dock", () => {
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

    const camera = moduleAt(layout, 0);
    expect(camera?.slots?.controls?.[0]).toMatchObject({
      id: DEFAULT_LIGHT_COMPONENT_NODE_ID,
      kind: "component",
      componentType: "light_control",
      controlRegion: "leading",
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
      },
    });
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
    expect(camera?.slots?.overlay).toBeUndefined();
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
      },
    });
  });

  it("rejects duplicate stable node IDs", () => {
    expect(() => validateStageDesign(stageWithNodes("same", "same"))).toThrow(
      'Stage node ID "same" is duplicated.',
    );
  });

  it("allows stage designs to target one or both responsive profiles", () => {
    const desktop = layoutWithModules("desktop-node");
    const phone = {
      ...layoutWithModules("phone-node"),
      id: "phone-stage",
      variants: { phone: variantWithNodes("phone-node") },
    };
    const desktopOnly = {
      ...desktop,
      variants: { default: desktop.variants.default },
    };

    expect(validateStageDesign(desktopOnly).variants.phone).toBeUndefined();
    expect(validateStageDesign(phone).variants.default).toBeUndefined();
    expect(() => validateStageDesign({ ...desktop, variants: {} })).toThrow(
      "Stage designs must provide at least one variant.",
    );
  });

  it("validates ordered desktop and phone flows against stage eligibility", () => {
    const shared = layoutWithModules("shared-node");
    const phone = {
      ...layoutWithModules("phone-node"),
      id: "phone-stage",
      variants: { phone: variantWithNodes("phone-node") },
    };
    const catalog = validateStageCatalog([shared, phone]);

    expect(
      validateStageFlow(
        {
          default: [shared.id],
          phone: [phone.id, shared.id],
        },
        catalog,
      ),
    ).toEqual({
      default: [shared.id],
      phone: [phone.id, shared.id],
    });
    expect(() =>
      validateStageFlow({ default: [phone.id], phone: [shared.id] }, catalog),
    ).toThrow(
      `Stage design "${phone.id}" does not support the default profile.`,
    );
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

    runtime.setInlineSize(500);
    render(runtime.render(), container);
    expect(
      container.querySelector(".stage-grid")?.getAttribute("data-stage-design"),
    ).toBe(second.id);
    expect(runtime.showStage(first.id)).toBe(true);
    runtime.setInlineSize(900);
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
    const alertsLoad = vi.fn(async () => createDefinition("alerts"));
    const eventsLoad = vi.fn(async () => createDefinition("events"));
    const loader = new PlaceableLoader({
      alerts: {
        load: alertsLoad,
        navigation: { icon: "alerts", labelKey: "navigation.alerts" },
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
      expect(container.querySelector("article")?.dataset.type).toBe("alerts");
    });
    const alerts = container.querySelector("article");
    expect(alertsLoad).toHaveBeenCalledOnce();
    expect(eventsLoad).not.toHaveBeenCalled();

    container
      .querySelectorAll<HTMLButtonElement>(".stage-stack-navigation button")[1]
      ?.click();
    await vi.waitFor(() => {
      render(runtime.render(), container);
      expect(container.querySelector("article")?.dataset.type).toBe("events");
    });
    expect(alerts?.isConnected).toBe(false);
    expect(eventsLoad).toHaveBeenCalledOnce();

    container
      .querySelectorAll<HTMLButtonElement>(".stage-stack-navigation button")[0]
      ?.click();
    render(runtime.render(), container);
    expect(container.querySelector("article")).toBe(alerts);
    expect(alertsLoad).toHaveBeenCalledOnce();
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

function activityModules(
  design: StageDesignDocument,
): readonly StageModuleNode[] {
  const node = defaultVariant(design).root.children[2]?.node;
  if (!node || node.kind !== "stack") {
    throw new Error("Expected the built-in activity stack.");
  }
  return (node as StageStackNode).children;
}

function alertEventModules(
  design: StageDesignDocument,
): readonly StageModuleNode[] {
  return activityModules(design).filter(
    ({ moduleType }) => moduleType === "alerts" || moduleType === "events",
  );
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
    revision: 0,
    schemaVersion: 1,
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
            children: [
              {
                config: {},
                id: "alerts-node",
                kind: "module",
                moduleType: "alerts",
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
      rows: ["fraction"],
    },
  };
  return {
    id: "stack-stage",
    name: "Stack",
    revision: 0,
    schemaVersion: 1,
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
