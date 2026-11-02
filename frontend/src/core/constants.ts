export const APP_NAME = "WatchZone";
export const APP_ID = APP_NAME.toLowerCase() as Lowercase<typeof APP_NAME>;
export const APP_VERSION =
  typeof __APP_VERSION__ === "undefined" ? "unbundled" : __APP_VERSION__;
export const APP_BUILD =
  typeof __APP_BUILD__ === "undefined" ? "unbundled" : __APP_BUILD__;

export const CARD_TAG = `${APP_ID}-card` as const;
export const CARD_TYPE = `custom:${CARD_TAG}` as const;
export const EDITOR_TAG = `${APP_ID}-card-editor` as const;
export const DEFAULT_CARD_TITLE = APP_NAME;
export const EDITOR_DIRTY_STATE_KEY = `${APP_ID}-card-editor`;
export const EDITOR_PREVIEW_DRAFT_EVENT = `${APP_ID}:editor-preview-draft`;
export const EDITOR_TEXT_PREVIEW_DELAY_MS = 200;
export const CAMERA_TAG = `${APP_ID}-camera` as const;
export const CAMERA_LIVE_PRESENTATION_TAG =
  `${CAMERA_TAG}-presentation` as const;
export const CAMERA_CONTROLS_TAG = `${CAMERA_TAG}-controls` as const;
export const TOAST_TAG = `${APP_ID}-toast` as const;
