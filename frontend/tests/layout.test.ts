import { render } from "lit";
import { describe, expect, it, vi } from "vitest";

import { createDefaultStageDesign } from "../src/card/default-layout";
import { LayoutRuntime } from "../src/card/layout-runtime";
import { PlaceableLoader } from "../src/card/placeable-loader";
import { normalizeCardConfig } from "../src/core/config";
import {
  DEFAULT_CAMERA_MODULE_NODE_ID,
  DEFAULT_LAYOUT_ROOT_NODE_ID,
  DEFAULT_PTZ_COMPONENT_NODE_ID,
  DEFAULT_TALK_COMPONENT_NODE_ID,
} from "../src/core/constants";
import { validateStageDesign } from "../src/core/layout";
import type { ModuleDefinition } from "../src/core/placeable";

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
    const layout = createDefaultStageDesign(normalizeCardConfig({}));

    expect(layout.variants.default).toEqual({
      root: {
        children: [],
        columns: 12,
        id: DEFAULT_LAYOUT_ROOT_NODE_ID,
        kind: "container",
      },
    });
  });

  it("seeds a stable camera module node from the initial card input", () => {
    const layout = createDefaultStageDesign(
      normalizeCardConfig({ camera_entity: "camera.front" }),
    );

    const children = layout.variants.default.root.children;
    expect(children).toHaveLength(1);
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
  });

  it("maps camera appearance once at the camera module boundary", () => {
    const layout = createDefaultStageDesign(
      normalizeCardConfig({
        camera_entity: "camera.front",
        camera_rounded_corners: false,
        camera_shadows: false,
      }),
    );
    const cameraNode = layout.variants.default.root.children[0]?.node;
    if (!cameraNode) throw new Error("Expected a camera module node.");

    expect(cameraNode.config).toMatchObject({
      cameras: [{ entityId: "camera.front" }],
      roundedCorners: false,
      shadowStyle: "none",
    });
    expect(
      (cameraNode.config as { cameras: readonly unknown[] }).cameras[0],
    ).not.toHaveProperty("roundedCorners");
  });

  it("composes an independent talk overlay only for opted-in cameras", () => {
    const layout = createDefaultStageDesign(
      normalizeCardConfig({
        cameras: [
          { entity_id: "camera.front", two_way_talk_enabled: true },
          { entity_id: "camera.back" },
        ],
      }),
    );

    const camera = layout.variants.default.root.children[0]?.node;
    expect(camera?.slots?.overlay).toHaveLength(1);
    expect(camera?.slots?.overlay?.[0]).toMatchObject({
      id: DEFAULT_TALK_COMPONENT_NODE_ID,
      kind: "component",
      componentType: "two_way_talk",
      config: { enabledCameraIds: ["camera.front"] },
    });
  });

  it("composes an independent provider-resolved PTZ overlay", () => {
    const layout = createDefaultStageDesign(
      normalizeCardConfig({
        cameras: [
          { entity_id: "camera.front", ptz_enabled: true },
          { entity_id: "camera.back" },
        ],
      }),
    );

    const camera = layout.variants.default.root.children[0]?.node;
    expect(camera?.slots?.overlay?.[0]).toMatchObject({
      id: DEFAULT_PTZ_COMPONENT_NODE_ID,
      kind: "component",
      componentType: "ptz",
      config: {
        cameras: [{ entityId: "camera.front", provider: "home_assistant" }],
      },
    });
  });

  it("rejects duplicate stable node IDs", () => {
    expect(() => validateStageDesign(stageWithNodes("same", "same"))).toThrow(
      'Stage node ID "same" is duplicated.',
    );
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
    runtime.setLayout(layoutWithModules("first", "second"));
    await vi.waitFor(() => {
      render(runtime.render(), container);
      expect(container.querySelectorAll("article")).toHaveLength(2);
    });
    host.updated();
    const before = [...container.querySelectorAll("article")];

    runtime.setLayout(layoutWithModules("second", "first"));
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
    runtime.setLayout(layoutWithModules("only"));

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
});

function layoutWithModules(...ids: string[]) {
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

function stageWithNodes(...ids: string[]) {
  return layoutWithModules(...ids);
}

function variantWithNodes(...ids: string[]) {
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
    },
  };
}
