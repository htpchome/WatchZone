import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EXPORTS_CHANGED_EVENT,
  EXPORTS_TAG,
  RECORDED_MEDIA_OPEN_EVENT,
} from "../src/core/constants";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { RecordedMediaRequest } from "../src/core/recorded-media";
import { startExportJob } from "../src/features/exports";
import { CameraSelectionContext } from "../src/stage/camera-selection-context";
import { ExportFilterContext } from "../src/stage/export-filter-context";
import type { ExportsModule } from "../src/stage/modules/exports/exports";
import "../src/stage/modules/exports/exports";

const readyExport = {
  camera: "front",
  created_time: 1_794_352_800,
  download_path: "/api/watchzone/exports/front-1/video?download=true",
  entity_id: "camera.front",
  id: "front-1",
  in_progress: false,
  name: "Front visitor",
  revision: "one",
  thumbnail_path: "/api/watchzone/exports/front-1/thumbnail?authSig=one",
  video_path: "/api/watchzone/exports/front-1/video",
};

const processingExport = {
  ...readyExport,
  camera: "driveway",
  created_time: Date.now() / 1_000,
  entity_id: "camera.driveway",
  id: "driveway-1",
  in_progress: true,
  name: "Driveway vehicle",
  revision: "two",
};

const stalledExport = {
  ...processingExport,
  created_time: 0,
  id: "driveway-stalled",
  name: "Stalled driveway vehicle",
};

describe("exports module", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("shows a mixed-camera library, filters it, and opens ready video", async () => {
    const callWS = vi.fn(async () => ({
      items: [readyExport, processingExport],
    }));
    const api = {
      callWS,
      identity: {},
      locale: { language: "en", time_zone: "UTC" },
      resolveUrl: (path: string) => `https://ha.local${path}`,
    } as unknown as HomeAssistantApi;
    const cameraSelection = new CameraSelectionContext();
    const exportFilter = new ExportFilterContext();
    const module = document.createElement(EXPORTS_TAG) as ExportsModule;
    module.api = api;
    module.cameraSelection = cameraSelection;
    module.exportFilter = exportFilter;
    module.placeableId = "exports-module";
    module.targetModuleId = "camera-module";
    document.body.append(module);
    cameraSelection.publish(
      "camera-module",
      {},
      {
        items: [
          { entityId: "camera.front", label: "Front Door" },
          { entityId: "camera.driveway", label: "Driveway" },
        ],
      },
      vi.fn(),
    );

    await vi.waitFor(() =>
      expect(module.shadowRoot?.querySelectorAll(".tile")).toHaveLength(2),
    );
    expect(
      (
        module.shadowRoot?.querySelector("wzc-media-day-header") as
          (HTMLElement & { label: string }) | null
      )?.label,
    ).toBe("Exports");
    const layoutToggle =
      module.shadowRoot?.querySelector<HTMLButtonElement>(".layout-toggle");
    const collection = module.shadowRoot?.querySelector("#exports-collection");
    expect(layoutToggle?.title).toBe("Show exports as grid");
    expect(layoutToggle?.getAttribute("aria-pressed")).toBe("false");
    expect(layoutToggle?.querySelector("ha-icon")?.getAttribute("icon")).toBe(
      "mdi:view-grid",
    );
    expect(collection?.classList.contains("list")).toBe(true);
    layoutToggle?.click();
    await module.updateComplete;
    expect(layoutToggle?.title).toBe("Show exports as list");
    expect(layoutToggle?.getAttribute("aria-pressed")).toBe("true");
    expect(layoutToggle?.querySelector("ha-icon")?.getAttribute("icon")).toBe(
      "mdi:view-list",
    );
    expect(collection?.classList.contains("grid")).toBe(true);
    layoutToggle?.click();
    await module.updateComplete;
    expect(module.shadowRoot?.textContent).toContain("Front Door");
    const processing = [
      ...(module.shadowRoot?.querySelectorAll<HTMLElement>(".tile") ?? []),
    ].find((tile) => tile.textContent?.includes("Driveway vehicle"));
    expect(processing?.querySelectorAll("button:disabled")).toHaveLength(4);

    exportFilter.setSortDirection("exports-module", "ascending");
    await module.updateComplete;
    expect(
      [
        ...(module.shadowRoot?.querySelectorAll<HTMLElement>(".title") ?? []),
      ].map((title) => title.textContent),
    ).toEqual(["Front visitor", "Driveway vehicle"]);

    exportFilter.setSortDirection("exports-module", "descending");
    await module.updateComplete;
    expect(
      [
        ...(module.shadowRoot?.querySelectorAll<HTMLElement>(".title") ?? []),
      ].map((title) => title.textContent),
    ).toEqual(["Driveway vehicle", "Front visitor"]);

    exportFilter.toggleCamera("exports-module", "camera.front");
    await module.updateComplete;
    expect(module.shadowRoot?.querySelectorAll(".tile")).toHaveLength(1);

    let opened: RecordedMediaRequest | undefined;
    module.addEventListener(RECORDED_MEDIA_OPEN_EVENT, (event) => {
      opened = (event as CustomEvent<RecordedMediaRequest>).detail;
    });
    module.shadowRoot
      ?.querySelector<HTMLButtonElement>(".tile-player")
      ?.click();
    expect(opened).toMatchObject({
      id: "camera.front:front-1",
      presentation: "export",
      title: "Front visitor",
    });
    module.remove();
  });

  it("keeps Add to Case visible and disabled", async () => {
    const api = {
      callWS: vi.fn(async () => ({ items: [readyExport] })),
      identity: {},
      resolveUrl: (path: string) => path,
    } as unknown as HomeAssistantApi;
    const cameraSelection = new CameraSelectionContext();
    const module = document.createElement(EXPORTS_TAG) as ExportsModule;
    module.api = api;
    module.cameraSelection = cameraSelection;
    module.placeableId = "exports-module";
    module.targetModuleId = "camera-module";
    document.body.append(module);
    cameraSelection.publish(
      "camera-module",
      {},
      { items: [{ entityId: "camera.front", label: "Front" }] },
      vi.fn(),
    );

    await vi.waitFor(() =>
      expect(module.shadowRoot?.querySelectorAll(".tile")).toHaveLength(1),
    );
    const button = module.shadowRoot?.querySelector<HTMLButtonElement>(
      'button[title="Add to Case — coming soon"]',
    );
    expect(button?.disabled).toBe(true);
    module.remove();
  });

  it("marks stale Frigate jobs as stalled and allows removal", async () => {
    const api = {
      callWS: vi.fn(async () => ({ items: [stalledExport] })),
      identity: {},
      resolveUrl: (path: string) => path,
    } as unknown as HomeAssistantApi;
    const cameraSelection = new CameraSelectionContext();
    const module = document.createElement(EXPORTS_TAG) as ExportsModule;
    module.api = api;
    module.cameraSelection = cameraSelection;
    module.placeableId = "exports-module";
    module.targetModuleId = "camera-module";
    document.body.append(module);
    cameraSelection.publish(
      "camera-module",
      {},
      { items: [{ entityId: "camera.driveway", label: "Driveway" }] },
      vi.fn(),
    );

    await vi.waitFor(() =>
      expect(module.shadowRoot?.textContent).toContain(
        "Export stalled in Frigate",
      ),
    );
    expect(
      module.shadowRoot?.querySelector<HTMLButtonElement>(
        'button[title="Remove export"]',
      )?.disabled,
    ).toBe(false);
    module.remove();
  });

  it("reloads the library when another workflow creates an export", async () => {
    const callWS = vi.fn(async () => ({ items: [readyExport] }));
    const api = {
      callWS,
      identity: {},
      resolveUrl: (path: string) => path,
    } as unknown as HomeAssistantApi;
    const cameraSelection = new CameraSelectionContext();
    const module = document.createElement(EXPORTS_TAG) as ExportsModule;
    module.api = api;
    module.cameraSelection = cameraSelection;
    module.placeableId = "exports-module";
    module.targetModuleId = "camera-module";
    document.body.append(module);
    cameraSelection.publish(
      "camera-module",
      {},
      { items: [{ entityId: "camera.front", label: "Front" }] },
      vi.fn(),
    );
    await vi.waitFor(() => expect(callWS).toHaveBeenCalled());
    const initialCalls = callWS.mock.calls.length;

    window.dispatchEvent(new CustomEvent(EXPORTS_CHANGED_EVENT));

    await vi.waitFor(() =>
      expect(callWS.mock.calls.length).toBeGreaterThan(initialCalls),
    );
    module.remove();
  });

  it("replaces a review export draft with the completed provider item", async () => {
    let resolveCreate: ((value: { export_id: string }) => void) | undefined;
    const create = new Promise<{ export_id: string }>((resolve) => {
      resolveCreate = resolve;
    });
    let created = false;
    const callWS = vi.fn(async (message: { type: string }) => {
      if (message.type === "watchzone/exports/create") return create;
      if (message.type === "watchzone/exports/list") {
        return { items: created ? [readyExport] : [] };
      }
      return {};
    });
    const api = {
      callWS,
      identity: {},
      locale: { language: "en", time_zone: "UTC" },
      resolveUrl: (path: string) => path,
    } as unknown as HomeAssistantApi;
    const cameraSelection = new CameraSelectionContext();
    const module = document.createElement(EXPORTS_TAG) as ExportsModule;
    module.api = api;
    module.cameraSelection = cameraSelection;
    module.placeableId = "exports-module";
    module.targetModuleId = "camera-module";
    document.body.append(module);
    cameraSelection.publish(
      "camera-module",
      {},
      { items: [{ entityId: "camera.front", label: "Front Door" }] },
      vi.fn(),
    );
    await vi.waitFor(() => expect(callWS).toHaveBeenCalled());

    startExportJob(api, {
      camera: "front",
      name: "  Front\u0000\n visitor  ",
      range: { entity_id: "camera.front", start_time: 100, end_time: 120 },
      reviewId: "review-1",
    });
    await vi.waitFor(() => {
      expect(module.shadowRoot?.querySelector(".tile.draft")).not.toBeNull();
      expect(module.shadowRoot?.querySelector("ha-spinner")).not.toBeNull();
      expect(callWS).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Front visitor",
          type: "watchzone/exports/create",
        }),
      );
    });

    created = true;
    resolveCreate?.({ export_id: readyExport.id });
    await vi.waitFor(() => {
      expect(module.shadowRoot?.querySelector(".tile.draft")).toBeNull();
      expect(module.shadowRoot?.querySelector(".title")?.textContent).toBe(
        "Front visitor",
      );
    });
    module.remove();
  });

  it("renames and confirms removal through separate mutations", async () => {
    const callWS = vi.fn(async (message: { type: string }) =>
      message.type === "watchzone/exports/list"
        ? { items: [readyExport] }
        : { success: true },
    );
    const api = {
      callWS,
      identity: {},
      resolveUrl: (path: string) => path,
    } as unknown as HomeAssistantApi;
    const cameraSelection = new CameraSelectionContext();
    const module = document.createElement(EXPORTS_TAG) as ExportsModule;
    module.api = api;
    module.cameraSelection = cameraSelection;
    module.placeableId = "exports-module";
    module.targetModuleId = "camera-module";
    document.body.append(module);
    cameraSelection.publish(
      "camera-module",
      {},
      { items: [{ entityId: "camera.front", label: "Front" }] },
      vi.fn(),
    );
    await vi.waitFor(() =>
      expect(module.shadowRoot?.querySelectorAll(".tile")).toHaveLength(1),
    );

    module.shadowRoot
      ?.querySelector<HTMLButtonElement>('button[title="Edit title"]')
      ?.click();
    await module.updateComplete;
    const input = module.shadowRoot?.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("Expected the export title input.");
    input.value = "  Renamed\u0000\n visitor  ";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    module.shadowRoot
      ?.querySelector<HTMLFormElement>("form")
      ?.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true }),
      );
    await vi.waitFor(() =>
      expect(callWS).toHaveBeenCalledWith({
        type: "watchzone/exports/rename",
        entity_id: "camera.front",
        export_id: "front-1",
        name: "Renamed visitor",
      }),
    );
    await vi.waitFor(() =>
      expect(module.shadowRoot?.querySelector("dialog")).toBeNull(),
    );
    expect(module.shadowRoot?.querySelector(".title")?.textContent).toBe(
      "Renamed visitor",
    );
    expect(
      module.shadowRoot
        ?.querySelector<HTMLButtonElement>(".tile-player")
        ?.getAttribute("aria-label"),
    ).toBe("Play Renamed visitor");

    module.shadowRoot
      ?.querySelector<HTMLButtonElement>('button[title="Remove export"]')
      ?.click();
    await module.updateComplete;
    expect(module.shadowRoot?.querySelector("dialog")?.textContent).toContain(
      "Are you sure",
    );
    module.shadowRoot
      ?.querySelector<HTMLButtonElement>("button.danger")
      ?.click();
    await vi.waitFor(() =>
      expect(callWS).toHaveBeenCalledWith({
        type: "watchzone/exports/delete",
        entity_id: "camera.front",
        export_id: "front-1",
      }),
    );
    await vi.waitFor(() =>
      expect(module.shadowRoot?.querySelectorAll(".tile")).toHaveLength(0),
    );
    module.remove();
  });
});
