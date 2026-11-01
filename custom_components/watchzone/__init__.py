"""WatchZone integration setup."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url, remove_extra_js_url
from homeassistant.components.http.server import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import (
    CARD_FILENAME,
    CARD_MODULE_URL,
    DOMAIN,
    FRONTEND_URL_BASE,
)
from .runtime import WatchZoneRuntime

_LOGGER = logging.getLogger(__name__)

_FRONTEND_DIRECTORY = Path(__file__).parent / "frontend"
_CARD_PATH = _FRONTEND_DIRECTORY / CARD_FILENAME
_ASSET_DIRECTORY = _FRONTEND_DIRECTORY / "assets"
_DATA_MODULE_REGISTERED = "module_registered"

type WatchZoneConfigEntry = ConfigEntry[WatchZoneRuntime]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the packaged frontend's authenticated static routes."""
    if not _CARD_PATH.is_file():
        _LOGGER.error("Packaged frontend asset is missing: %s", _CARD_PATH)
        return False

    static_paths = [
        StaticPathConfig(
            f"{FRONTEND_URL_BASE}/{CARD_FILENAME}",
            str(_CARD_PATH),
            False,
        )
    ]
    if _ASSET_DIRECTORY.is_dir():
        static_paths.append(
            StaticPathConfig(
                f"{FRONTEND_URL_BASE}/assets",
                str(_ASSET_DIRECTORY),
                True,
            )
        )

    await hass.http.async_register_static_paths(static_paths)
    hass.data.setdefault(DOMAIN, {_DATA_MODULE_REGISTERED: False})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: WatchZoneConfigEntry) -> bool:
    """Set up the configured WatchZone application."""
    entry.runtime_data = WatchZoneRuntime(entry_id=entry.entry_id)

    domain_data = hass.data.setdefault(DOMAIN, {_DATA_MODULE_REGISTERED: False})
    if not domain_data[_DATA_MODULE_REGISTERED]:
        add_extra_js_url(hass, CARD_MODULE_URL)
        domain_data[_DATA_MODULE_REGISTERED] = True

    return True


async def async_unload_entry(hass: HomeAssistant, entry: WatchZoneConfigEntry) -> bool:
    """Unload WatchZone and stop injecting its frontend module."""
    domain_data = hass.data.get(DOMAIN)
    if domain_data and domain_data.get(_DATA_MODULE_REGISTERED):
        remove_extra_js_url(hass, CARD_MODULE_URL)
        domain_data[_DATA_MODULE_REGISTERED] = False

    return True
