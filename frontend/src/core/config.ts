import { CARD_TYPE, DEFAULT_CARD_TITLE } from "./constants";

export interface WatchZoneCardConfig {
  readonly camera_entity?: string;
  readonly remove_outer_rounded_edges?: boolean;
  readonly remove_outer_shadow?: boolean;
  readonly type: typeof CARD_TYPE;
  readonly title: string;
  readonly [key: string]: unknown;
}

export function normalizeCardConfig(value: unknown): WatchZoneCardConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("WatchZone card configuration must be an object.");
  }
  const source = value as Record<string, unknown>;

  const title = "title" in source ? source.title : DEFAULT_CARD_TITLE;
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("WatchZone card title must be a non-empty string.");
  }

  const cameraEntity =
    "camera_entity" in source ? source.camera_entity : undefined;
  if (
    cameraEntity !== undefined &&
    (typeof cameraEntity !== "string" ||
      !cameraEntity.trim().startsWith("camera."))
  ) {
    throw new Error("WatchZone camera must be a camera entity ID.");
  }

  for (const key of [
    "remove_outer_rounded_edges",
    "remove_outer_shadow",
  ] as const) {
    if (key in source && typeof source[key] !== "boolean") {
      throw new Error(`WatchZone ${key} must be a boolean.`);
    }
  }

  const normalized: Record<string, unknown> = {
    ...source,
    ...(typeof cameraEntity === "string" && cameraEntity.trim()
      ? { camera_entity: cameraEntity.trim() }
      : {}),
    type: CARD_TYPE,
    title: title.trim(),
  };
  for (const key of [
    "remove_outer_rounded_edges",
    "remove_outer_shadow",
  ] as const) {
    if (typeof source[key] === "boolean") {
      normalized[key] = source[key];
    } else {
      delete normalized[key];
    }
  }
  return normalized as WatchZoneCardConfig;
}

export function cardConfigSignature(config: WatchZoneCardConfig): string {
  return JSON.stringify(config);
}
