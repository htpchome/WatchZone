export const CAMERA_OVERLAY_HIDE_DELAY_MS = 2500;
export const CAMERA_CAROUSEL_NAVIGATION_HEIGHT_RATIO = 0.1;
export const CAMERA_CAROUSEL_NAVIGATION_MAX_SIZE_PX = 72;
export const CAMERA_CAROUSEL_NAVIGATION_MIN_SIZE_PX = 40;
export const CAMERA_CONTROL_COMPACT_WIDTH_PX = 480;
export const CAMERA_CONTROL_SHORT_HEIGHT_PX = 360;
export const CAMERA_CONTROL_VERY_SHORT_HEIGHT_PX = 240;
export const CAMERA_CONTROL_SIZE_DEFAULT = "2.75rem";
export const CAMERA_CONTROL_SIZE_COMPACT = "2.35rem";
export const CAMERA_CONTROL_SIZE_SHORT = "2.25rem";
export const CAMERA_CONTROL_SIZE_VERY_SHORT = "1.875rem";

/**
 * The HA websocket can become ready just before integration commands finish
 * registering after a restart. Keep retries bounded and owned by the camera
 * runtime controller rather than coupling capability recovery to navigation.
 */
export const CAMERA_RUNTIME_RESUBSCRIBE_DELAYS_MS = [
  250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;
