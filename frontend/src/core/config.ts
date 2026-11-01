import { CARD_TYPE, DEFAULT_CARD_TITLE } from "./constants";

export interface WatchZoneCardConfig {
  readonly camera_entity?: string;
  readonly type: typeof CARD_TYPE;
  readonly title: string;
  readonly [key: string]: unknown;
}

export function normalizeCardConfig(value: unknown): WatchZoneCardConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("WatchZone card configuration must be an object.");
  }

  const title = "title" in value ? value.title : DEFAULT_CARD_TITLE;
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("WatchZone card title must be a non-empty string.");
  }

  const cameraEntity =
    "camera_entity" in value ? value.camera_entity : undefined;
  if (
    cameraEntity !== undefined &&
    (typeof cameraEntity !== "string" ||
      !cameraEntity.trim().startsWith("camera."))
  ) {
    throw new Error("WatchZone camera must be a camera entity ID.");
  }

  return {
    ...value,
    ...(typeof cameraEntity === "string" && cameraEntity.trim()
      ? { camera_entity: cameraEntity.trim() }
      : {}),
    type: CARD_TYPE,
    title: title.trim(),
  };
}

export function cardConfigSignature(config: WatchZoneCardConfig): string {
  return JSON.stringify(config);
}
