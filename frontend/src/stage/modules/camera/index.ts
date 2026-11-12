import { CAMERA_MODULE_TYPE, CAMERA_TAG } from "../../../core/constants";
import { cameraImageUrl } from "../../../core/home-assistant";
import { englishLocalize } from "../../../core/localization";
import type { MediaSessionLease } from "../../../core/media-session-manager";
import type { MediaRetentionPreference } from "../../../core/media-retention-policy";
import type { AlertTakeoverMode, SlideTransition } from "../../../core/config";
import type {
  ModuleDefinition,
  PlaceableRuntimeContext,
} from "../../placeable";
import { LiveSourceResolver } from "../../../providers/live-source-resolver";
import type {
  CameraItemConfig,
  CameraModule,
  CameraShadowStyle,
} from "./camera";

export interface CameraModuleConfig {
  readonly alertTakeoverMode: AlertTakeoverMode;
  readonly cameras: readonly CameraModuleItemConfig[];
  readonly highlightActivity: boolean;
  readonly retentionPreference: MediaRetentionPreference;
  readonly roundedCorners: boolean;
  readonly shadowStyle: CameraShadowStyle;
  readonly transition: SlideTransition;
  readonly startAlertTakeoverOn: boolean;
}

type CameraModuleItemConfig = Omit<
  CameraItemConfig,
  "available" | "label" | "posterUrl"
> & { readonly title: string };

const resolver = new LiveSourceResolver();
const posterPreloads = new Map<string, HTMLImageElement>();
const friendlyNameCaches = new WeakMap<CameraModule, Map<string, string>>();
let definitionPromise: Promise<void> | undefined;

export const moduleDefinition: ModuleDefinition<
  CameraModuleConfig,
  "cameraSelection" | "cameraSession"
> = {
  contextKeys: ["cameraSelection", "cameraSession"],
  type: CAMERA_MODULE_TYPE,
  validateConfig: validateCameraConfig,
  getEntityIds: ({ cameras }) => cameras.map(({ entityId }) => entityId),
  async prepare(config, context) {
    const first = config.cameras[0];
    if (!first || !context.api || !context.hass?.states[first.entityId])
      return undefined;
    const posterUrl = cameraImageUrl(context.hass, first.entityId);
    if (posterUrl) preloadPoster(posterUrl);
    let lease: MediaSessionLease;
    if (first.connection === "frigate_go2rtc") {
      const source = await resolver.resolveFrigate(context.api, first.entityId);
      const policy = resolver.frigateTransportPolicy(
        first.frigateFallback ?? "mse",
      );
      lease = policy.hlsOnly
        ? await resolver.acquireFrigateHls(
            context.api,
            first.entityId,
            source,
            {
              initialMuted: true,
              lowLatencyHls: true,
              nativeHlsOnly: true,
            },
          )
        : await resolver.acquireFrigateWebRtc(
            context.api,
            first.entityId,
            source,
          );
    } else {
      lease = await resolver.acquireHomeAssistantWebRtc(
        context.api,
        first.entityId,
      );
    }
    return { release: () => lease.release() };
  },
  define() {
    return (definitionPromise ??= import("./camera").then(() => undefined));
  },
  createElement() {
    return document.createElement(CAMERA_TAG);
  },
  updateElement(element, config, context) {
    updateCameraElement(element as CameraModule, config, context);
  },
};

function preloadPoster(url: string): void {
  if (posterPreloads.has(url)) return;
  const image = new Image();
  posterPreloads.set(url, image);
  const release = () => {
    if (posterPreloads.get(url) === image) posterPreloads.delete(url);
  };
  image.addEventListener("load", release, { once: true });
  image.addEventListener("error", release, { once: true });
  image.decoding = "async";
  image.fetchPriority = "high";
  image.src = url;
}

function updateCameraElement(
  camera: CameraModule,
  config: CameraModuleConfig,
  context: PlaceableRuntimeContext<"cameraSelection" | "cameraSession">,
): void {
  const friendlyNames = cameraFriendlyNames(camera);
  const activeEntityIds = new Set(
    config.cameras.map(({ entityId }) => entityId),
  );
  for (const entityId of friendlyNames.keys()) {
    if (!activeEntityIds.has(entityId)) friendlyNames.delete(entityId);
  }
  camera.api = context.api;
  camera.alertTakeoverMode = config.alertTakeoverMode;
  camera.cameraSelection = context.cameraSelection;
  camera.cameraSession = context.cameraSession;
  camera.localize = context.localize ?? englishLocalize;
  camera.highlightActivity = config.highlightActivity;
  camera.retentionPreference = config.retentionPreference;
  camera.roundedCorners = config.roundedCorners;
  camera.shadowStyle = config.shadowStyle;
  camera.transition = config.transition;
  camera.startAlertTakeoverOn = config.startAlertTakeoverOn;
  camera.selectionId = context.placeableId;
  camera.cameras = config.cameras.map((item) => {
    const friendlyName = currentFriendlyName(
      context.hass?.states[item.entityId]?.attributes.friendly_name,
    );
    if (friendlyName) friendlyNames.set(item.entityId, friendlyName);
    return {
      ...item,
      available: Boolean(context.hass?.states[item.entityId]),
      label:
        item.title ||
        friendlyName ||
        friendlyNames.get(item.entityId) ||
        humanizeCameraEntityId(item.entityId),
      posterUrl: cameraImageUrl(context.hass, item.entityId),
    };
  });
}

function cameraFriendlyNames(camera: CameraModule): Map<string, string> {
  const existing = friendlyNameCaches.get(camera);
  if (existing) return existing;
  const names = new Map<string, string>();
  friendlyNameCaches.set(camera, names);
  return names;
}

function currentFriendlyName(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function humanizeCameraEntityId(entityId: string): string {
  const separator = entityId.indexOf(".");
  const objectId = separator >= 0 ? entityId.slice(separator + 1) : entityId;
  return objectId
    .replace(/[_-]+/g, " ")
    .replace(
      /(^| )([a-z])/g,
      (_match, prefix: string, letter: string) =>
        `${prefix}${letter.toUpperCase()}`,
    );
}

function validateCameraConfig(value: unknown): CameraModuleConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("Camera module configuration must be an object.");
  }
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.cameras) || source.cameras.length === 0)
    throw new Error("Camera modules require at least one camera.");
  const cameras = source.cameras.map((camera, index) =>
    validateCameraItem(camera, index),
  );
  if (
    source.retentionPreference !== "automatic" &&
    source.retentionPreference !== "reduced_bandwidth"
  ) {
    throw new Error("Camera modules require a valid retention preference.");
  }
  if (typeof source.roundedCorners !== "boolean") {
    throw new Error("Camera module roundedCorners must be a boolean.");
  }
  if (
    source.shadowStyle !== "medium" &&
    source.shadowStyle !== "small" &&
    source.shadowStyle !== "none"
  ) {
    throw new Error("Camera module shadowStyle is invalid.");
  }
  if (typeof source.highlightActivity !== "boolean") {
    throw new Error("Camera modules require a highlightActivity setting.");
  }
  if (
    source.alertTakeoverMode !== "off" &&
    source.alertTakeoverMode !== "alerts" &&
    source.alertTakeoverMode !== "detections" &&
    source.alertTakeoverMode !== "both"
  ) {
    throw new Error("Camera modules require a valid activity takeover mode.");
  }
  if (typeof source.startAlertTakeoverOn !== "boolean") {
    throw new Error("Camera modules require an activity takeover start state.");
  }
  if (
    source.transition !== "none" &&
    source.transition !== "slide" &&
    source.transition !== "fade"
  ) {
    throw new Error("Camera modules require a valid slide transition.");
  }
  return {
    alertTakeoverMode: source.alertTakeoverMode,
    cameras,
    highlightActivity: source.highlightActivity,
    retentionPreference: source.retentionPreference,
    roundedCorners: source.roundedCorners,
    shadowStyle: source.shadowStyle,
    transition: source.transition,
    startAlertTakeoverOn: source.startAlertTakeoverOn,
  };
}

function validateCameraItem(
  value: unknown,
  index: number,
): CameraModuleItemConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Camera module item ${index + 1} must be an object.`);
  }
  const source = value as Record<string, unknown>;
  if (
    typeof source.entityId !== "string" ||
    !source.entityId.startsWith("camera.")
  )
    throw new Error("Camera modules require camera entity IDs.");
  if (
    source.connection !== undefined &&
    source.connection !== "home_assistant" &&
    source.connection !== "frigate_go2rtc"
  ) {
    throw new Error("Camera modules require a valid connection type.");
  }
  if (
    source.frigateFallback !== undefined &&
    source.frigateFallback !== "mse" &&
    source.frigateFallback !== "hls"
  ) {
    throw new Error("Camera modules require a valid Frigate fallback.");
  }
  for (const key of [
    "lowLatencyHls",
    "startUnmutedPcTablet",
    "startUnmutedPhone",
  ] as const) {
    if (typeof source[key] !== "boolean") {
      throw new Error(`Camera module ${key} must be a boolean.`);
    }
  }
  return {
    connection:
      source.connection === "frigate_go2rtc"
        ? "frigate_go2rtc"
        : "home_assistant",
    entityId: source.entityId,
    frigateFallback: source.frigateFallback === "hls" ? "hls" : "mse",
    lowLatencyHls: source.lowLatencyHls as boolean,
    startUnmutedPcTablet: source.startUnmutedPcTablet as boolean,
    startUnmutedPhone: source.startUnmutedPhone as boolean,
    title: typeof source.title === "string" ? source.title.trim() : "",
  } as CameraModuleItemConfig;
}

export type { CameraModule, CameraShadowStyle } from "./camera";
