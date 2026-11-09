"""Constants for the WatchZone integration."""

DOMAIN = "watchzone"
NAME = "WatchZone"
VERSION = "0.0.4-dev.192"

DATA_RUNTIME = "runtime"

CONF_HLS_PREWARM_CAMERAS = "hls_prewarm_cameras"
MAX_HLS_PREWARM_CAMERAS = 12
SUBENTRY_TYPE_CAMERA_PRELOAD = "camera_preload"
SUBENTRY_UNIQUE_ID_CAMERA_PRELOAD = "camera_preload"
CAMERA_PRELOAD_TITLE = "Preloaded Cameras"

CARD_FILENAME = "watchzone.js"
FRONTEND_URL_BASE = f"/{DOMAIN}/frontend"
CARD_MODULE_URL = f"{FRONTEND_URL_BASE}/{CARD_FILENAME}?v={VERSION}"
