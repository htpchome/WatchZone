export const CAMERA_OVERLAY_HIDE_DELAY_MS = 2500;

/**
 * The HA websocket can become ready just before integration commands finish
 * registering after a restart. Keep retries bounded and owned by the camera
 * runtime controller rather than coupling capability recovery to navigation.
 */
export const CAMERA_RUNTIME_RESUBSCRIBE_DELAYS_MS = [
  250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;
