"""Frigate browser-source resolution through its Home Assistant integration."""

from __future__ import annotations

from collections.abc import Callable
from typing import cast
from urllib.parse import quote

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.importlib import async_import_module

from ..source import BrowserLiveSource

_FRIGATE_DOMAIN = "frigate"


async def async_resolve(
    hass: HomeAssistant, entity_id: str
) -> BrowserLiveSource:
    """Resolve the exact Frigate entry, MQTT client identity, and stream."""
    registry_entry = er.async_get(hass).async_get(entity_id)
    if (
        registry_entry is None
        or registry_entry.platform != _FRIGATE_DOMAIN
        or registry_entry.config_entry_id is None
    ):
        raise HomeAssistantError("Camera is not owned by the Frigate integration")

    state = hass.states.get(entity_id)
    stream_id = state.attributes.get("camera_name") if state else None
    if not isinstance(stream_id, str) or not stream_id.strip():
        raise HomeAssistantError("Frigate camera stream identity is unavailable")

    instance_id = await _async_instance_id(
        hass, registry_entry.config_entry_id, state.attributes if state else {}
    )
    encoded_instance = quote(instance_id, safe="")
    encoded_stream = quote(stream_id.strip(), safe="")
    return BrowserLiveSource(
        provider_id=_FRIGATE_DOMAIN,
        provider_instance_id=registry_entry.config_entry_id,
        stream_id=stream_id.strip(),
        websocket_path=(
            f"/api/frigate/{encoded_instance}/go2rtc/ws/api/ws?src={encoded_stream}"
        ),
    )


async def _async_instance_id(
    hass: HomeAssistant,
    config_entry_id: str,
    attributes: object,
) -> str:
    """Read Frigate's explicit instance identity without deriving it from titles."""
    config_entries = getattr(hass, "config_entries", None)
    config_entry = (
        config_entries.async_get_entry(config_entry_id)
        if config_entries is not None
        else None
    )
    if config_entry is not None:
        try:
            module = await async_import_module(
                hass, "custom_components.frigate.views"
            )
            resolver = getattr(
                module, "get_frigate_instance_id_for_config_entry", None
            )
            if callable(resolver):
                value = cast(Callable[[object, object], object], resolver)(
                    hass, config_entry
                )
                if isinstance(value, str) and value.strip():
                    return value.strip()
        except (ImportError, AttributeError, TypeError, ValueError):
            pass

    if isinstance(attributes, dict):
        value = attributes.get("client_id") or attributes.get("mqtt_client_id")
        if isinstance(value, str) and value.strip():
            return value.strip()
    raise HomeAssistantError("Frigate instance identity is unavailable")
