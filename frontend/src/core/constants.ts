export const APP_NAME = "WatchZone";
export const APP_ID = "wzc";
export const APP_VERSION = __APP_VERSION__;
export const APP_BUILD = __APP_BUILD__;

export const CARD_TAG = `${APP_ID}-card`;
export const CARD_TYPE = `custom:${CARD_TAG}`;
export const EDITOR_TAG = `${CARD_TAG}-editor`;

export const DEFAULT_CARD_TITLE = APP_NAME;
export const EDITOR_DIRTY_STATE_KEY = `${CARD_TAG}-editor`;
export const EDITOR_PREVIEW_DRAFT_EVENT = `${CARD_TAG}-preview-draft`;
export const EDITOR_TEXT_PREVIEW_DELAY_MS = 200;
export const CAMERA_TAG = `${APP_ID}-camera`;
export const CAMERA_LIVE_PRESENTATION_TAG = `${CAMERA_TAG}-live`;
export const CAMERA_CONTROLS_TAG = `${CAMERA_TAG}-controls`;
export const RUNTIME_DIAGNOSTICS_KEY = APP_ID;
export const MEDIA_SESSION_RUNTIME_KEY = `${APP_ID}:media-session-manager`;
