"""Constants for the WatchZone integration."""

DOMAIN = "watchzone"
NAME = "WatchZone"
VERSION = "0.0.4-dev.85"

DATA_RUNTIME = "runtime"

CARD_FILENAME = "watchzone.js"
FRONTEND_URL_BASE = f"/{DOMAIN}/frontend"
CARD_MODULE_URL = f"{FRONTEND_URL_BASE}/{CARD_FILENAME}?v={VERSION}"
