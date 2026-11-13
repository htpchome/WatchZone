import type { AdditionalCameraLayout, CameraConfig } from "./config";

export interface CameraPresentationItem {
  readonly cameras:
    readonly [CameraConfig] | readonly [CameraConfig, CameraConfig];
  readonly id: string;
  readonly label?: string;
  readonly layout?: AdditionalCameraLayout;
}

/** Builds the user-facing camera order without duplicating camera configuration. */
export function cameraPresentationItems(
  cameras: readonly CameraConfig[],
): readonly CameraPresentationItem[] {
  const secondaryIds = new Set(
    cameras.flatMap(({ additional_camera: group }) =>
      group ? [group.entity_id] : [],
    ),
  );
  const byId = new Map(cameras.map((camera) => [camera.entity_id, camera]));
  const items: CameraPresentationItem[] = [];
  for (const camera of cameras) {
    if (secondaryIds.has(camera.entity_id)) continue;
    const group = camera.additional_camera;
    if (!group) {
      items.push({ cameras: [camera], id: camera.entity_id });
      continue;
    }
    const secondary = byId.get(group.entity_id);
    if (!secondary) continue;
    items.push({
      cameras: [camera, secondary],
      id: camera.entity_id,
      label: camera.title,
      layout: group.layout,
    });
  }
  return items;
}

export function nextCameraGroupTitle(cameras: readonly CameraConfig[]): string {
  const titles = new Set(
    cameras.flatMap((camera) =>
      camera.additional_camera ? [camera.title.trim().toLocaleLowerCase()] : [],
    ),
  );
  for (let index = 0; index < 13; index += 1) {
    const first = String.fromCharCode(65 + index * 2);
    const second = String.fromCharCode(66 + index * 2);
    const title = `Group ${first}/${second}`;
    if (!titles.has(title.toLocaleLowerCase())) return title;
  }
  return `Group ${cameras.length + 1}`;
}

export function groupedCameraEntityIds(
  cameras: readonly CameraConfig[],
  exceptMainEntityId?: string,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const camera of cameras) {
    if (!camera.additional_camera || camera.entity_id === exceptMainEntityId) {
      continue;
    }
    ids.add(camera.entity_id);
    ids.add(camera.additional_camera.entity_id);
  }
  return ids;
}
