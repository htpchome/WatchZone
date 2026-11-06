export const CAMERA_CONNECTION_SOURCES = [
  "home_assistant",
  "frigate_go2rtc",
] as const;

export type CameraConnectionSource = (typeof CAMERA_CONNECTION_SOURCES)[number];

/** Provider-neutral source currently painted by a camera presentation. */
export type PresentedLiveSource = "hls" | "mse" | "webrtc";

export type CameraProviderId = "home_assistant" | "frigate";

export function isCameraConnectionSource(
  value: unknown,
): value is CameraConnectionSource {
  return CAMERA_CONNECTION_SOURCES.some((source) => source === value);
}

export function cameraProviderId(
  source: CameraConnectionSource,
): CameraProviderId {
  return source === "frigate_go2rtc" ? "frigate" : "home_assistant";
}

export function cameraSourceKey(
  source: CameraConnectionSource,
  entityId: string,
): string {
  return `${source}:${entityId}`;
}
