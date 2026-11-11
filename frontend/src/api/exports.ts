import type { HomeAssistantApi } from "../core/home-assistant";

export interface ExportItem {
  readonly camera: string;
  readonly created_time: number;
  readonly download_path: string;
  readonly entity_id: string;
  readonly id: string;
  readonly in_progress: boolean;
  readonly name: string;
  readonly revision: string;
  readonly thumbnail_path: string;
  readonly video_path: string;
}

interface ExportWindow {
  readonly items: readonly ExportItem[];
}

export interface ExportRange {
  readonly end_time: number;
  readonly entity_id: string;
  readonly start_time: number;
}

export async function prepareExport(
  api: HomeAssistantApi,
  range: ExportRange,
): Promise<string> {
  const result = await api.callWS<{ readonly name: string }>({
    type: "watchzone/exports/prepare",
    ...range,
  });
  return result.name;
}

export async function createExport(
  api: HomeAssistantApi,
  range: ExportRange,
  name: string,
): Promise<void> {
  await api.callWS({
    type: "watchzone/exports/create",
    ...range,
    name,
  });
}

export async function listExports(
  api: HomeAssistantApi,
  entityIds: readonly string[],
): Promise<readonly ExportItem[]> {
  const result = await api.callWS<ExportWindow>({
    type: "watchzone/exports/list",
    entity_ids: entityIds,
  });
  return result.items;
}

export async function renameExport(
  api: HomeAssistantApi,
  item: Pick<ExportItem, "entity_id" | "id">,
  name: string,
): Promise<void> {
  await api.callWS({
    type: "watchzone/exports/rename",
    entity_id: item.entity_id,
    export_id: item.id,
    name,
  });
}

export async function deleteExport(
  api: HomeAssistantApi,
  item: Pick<ExportItem, "entity_id" | "id">,
): Promise<void> {
  await api.callWS({
    type: "watchzone/exports/delete",
    entity_id: item.entity_id,
    export_id: item.id,
  });
}
