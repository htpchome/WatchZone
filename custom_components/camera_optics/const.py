"""Constants for the CameraOptics integration."""

DOMAIN = "camera_optics"
NAME = "CameraOptics"
VERSION = "0.0.5-dev.19"
CONFIG_ENTRY_VERSION = 2

DATA_RUNTIME = "runtime"

CONF_DIAGNOSTIC_LOGGING = "diagnostic_logging"
DEFAULT_DIAGNOSTIC_LOGGING = False

CONF_HLS_PREWARM_CAMERAS = "hls_prewarm_cameras"
MAX_HLS_PREWARM_CAMERAS = 12
SUBENTRY_TYPE_CAMERA_PRELOAD = "camera_preload"
SUBENTRY_UNIQUE_ID_CAMERA_PRELOAD = "camera_preload"
CAMERA_PRELOAD_TITLE = "Preloaded Cameras"

CARD_FILENAME = "camera-optics.js"
FRONTEND_URL_BASE = f"/{DOMAIN}/frontend"
CARD_MODULE_URL = f"{FRONTEND_URL_BASE}/{CARD_FILENAME}?v={VERSION}"
