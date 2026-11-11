import { afterEach, describe, expect, it, vi } from "vitest";

import { EXPORTS_TAG, RECORDED_MEDIA_OPEN_EVENT } from "../src/core/constants";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { RecordedMediaRequest } from "../src/core/recorded-media";
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
  entity_id: "camera.driveway",
  id: "driveway-1",
  in_progress: true,
  name: "Driveway vehicle",
  revision: "two",
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
    expect(module.shadowRoot?.textContent).toContain("Front Door");
    const processing = module.shadowRoot?.querySelectorAll(".tile")[1];
    expect(processing?.querySelectorAll("button:disabled")).toHaveLength(4);

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
    input.value = "Renamed visitor";
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
    module.remove();
  });
});
