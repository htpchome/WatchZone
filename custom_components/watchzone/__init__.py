"""WatchZone integration setup."""

from __future__ import annotations

import logging
from pathlib import Path
from urllib.parse import urlsplit

from homeassistant.components.http.server import StaticPathConfig
from homeassistant.components.lovelace.const import (
    CONF_RESOURCE_TYPE_WS,
    LOVELACE_DATA,
)
from homeassistant.components.lovelace.resources import (
    ResourceStorageCollection,
    ResourceYAMLCollection,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_ID, CONF_TYPE, CONF_URL
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
_DATA_RESOURCE_ID = "resource_id"
_DATA_YAML_RESOURCE = "yaml_resource"

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
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: WatchZoneConfigEntry) -> bool:
    """Set up the configured WatchZone application."""
    entry.runtime_data = WatchZoneRuntime(entry_id=entry.entry_id)
    await _async_register_card_resource(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: WatchZoneConfigEntry) -> bool:
    """Unload WatchZone and remove its Lovelace module resource."""
    domain_data = hass.data.get(DOMAIN)
    if not domain_data:
        return True

    resources = hass.data[LOVELACE_DATA].resources
    if resource_id := domain_data.pop(_DATA_RESOURCE_ID, None):
        if isinstance(resources, ResourceStorageCollection):
            await resources.async_delete_item(resource_id)
    if yaml_resource := domain_data.pop(_DATA_YAML_RESOURCE, None):
        if (
            isinstance(resources, ResourceYAMLCollection)
            and yaml_resource in resources.data
        ):
            resources.data.remove(yaml_resource)

    return True


def _is_watchzone_resource(resource: dict[str, object]) -> bool:
    """Return whether a Lovelace resource points at WatchZone's stable entry."""
    url = resource.get(CONF_URL)
    return isinstance(url, str) and urlsplit(url).path == (
        f"{FRONTEND_URL_BASE}/{CARD_FILENAME}"
    )


async def _async_register_card_resource(hass: HomeAssistant) -> None:
    """Register the card through Lovelace's awaited module-resource path."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    resources = hass.data[LOVELACE_DATA].resources
    await resources.async_get_info()
    existing = next(
        (item for item in resources.async_items() if _is_watchzone_resource(item)),
        None,
    )

    if isinstance(resources, ResourceStorageCollection):
        if existing is None:
            existing = await resources.async_create_item(
                {
                    CONF_RESOURCE_TYPE_WS: "module",
                    CONF_URL: CARD_MODULE_URL,
                }
            )
        elif (
            existing.get(CONF_TYPE) != "module"
            or existing.get(CONF_URL) != CARD_MODULE_URL
        ):
            existing = await resources.async_update_item(
                existing[CONF_ID],
                {
                    CONF_RESOURCE_TYPE_WS: "module",
                    CONF_URL: CARD_MODULE_URL,
                },
            )
        domain_data[_DATA_RESOURCE_ID] = existing[CONF_ID]
        return

    assert isinstance(resources, ResourceYAMLCollection)
    if existing is None:
        existing = {CONF_TYPE: "module", CONF_URL: CARD_MODULE_URL}
        resources.data.append(existing)
        domain_data[_DATA_YAML_RESOURCE] = existing
