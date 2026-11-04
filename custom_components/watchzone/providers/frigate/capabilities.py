"""Truthful capability discovery through the installed Frigate integration."""

from __future__ import annotations

import json
from typing import Any, Protocol, cast

from aiohttp import ClientTimeout
from homeassistant.const import CONF_URL
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from yarl import URL

from ..ptz import PtzCapabilities
from .live import async_get_frigate_client

_CAPABILITY_TIMEOUT = ClientTimeout(total=5)


class _CapabilityClient(Protocol):
    """Narrow optional Frigate integration client surface."""

    validate_ssl: bool

    async def get_auth_headers(self) -> dict[str, str]:
        """Return current Frigate authentication headers."""

    async def async_get_ptz_info(self, camera: str) -> Any:
        """Return Frigate's runtime PTZ information."""


async def async_ptz_capabilities(
    hass: HomeAssistant, entity_id: str
) -> PtzCapabilities | None:
    """Return runtime PTZ truth for an HA Frigate camera, if applicable."""
    context = await _async_context(hass, entity_id)
    if context is None:
        return None
    client, camera_name, _ = context
    if not hasattr(client, "async_get_ptz_info"):
        return PtzCapabilities()
    try:
        payload = await client.async_get_ptz_info(camera_name)
    except Exception:
        return PtzCapabilities()
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return PtzCapabilities()
    return _normalize_ptz_capabilities(payload)


def _normalize_ptz_capabilities(payload: object) -> PtzCapabilities:
    """Normalize only explicit runtime PTZ features."""
    if not isinstance(payload, dict):
        return PtzCapabilities()
    features = {
        str(value).strip().lower()
        for value in payload.get("features", ())
        if isinstance(value, str)
    }
    directional = bool(features & {"pt", "pt-r"})
    presets = tuple(
        value.strip()
        for value in payload.get("presets", ())
        if isinstance(value, str) and value.strip()
    )
    return PtzCapabilities(
        pan=directional,
        tilt=directional,
        zoom="zoom" in features,
        focus="focus" in features,
        presets=presets,
    )


async def async_two_way_audio_capability(
    hass: HomeAssistant, entity_id: str
) -> bool | None:
    """Return go2rtc backchannel truth for an HA Frigate camera, if applicable."""
    context = await _async_context(hass, entity_id)
    if context is None:
        return None
    client, camera_name, base_url = context
    try:
        headers = await client.get_auth_headers()
        response = await async_get_clientsession(hass).get(
            URL(base_url) / "api/go2rtc/streams",
            params={
                "src": camera_name,
                "video": "all",
                "audio": "all",
                "microphone": "",
            },
            headers=headers,
            ssl=client.validate_ssl,
            timeout=_CAPABILITY_TIMEOUT,
        )
        async with response:
            if response.status != 200:
                return False
            payload = await response.json(content_type=None)
    except Exception:
        return False
    return _has_audio_backchannel(payload)


def _has_audio_backchannel(payload: object) -> bool:
    """Recognize an actual browser-to-camera audio producer."""
    if not isinstance(payload, dict):
        return False
    producers = payload.get("producers")
    if not isinstance(producers, list):
        return False
    for producer in producers:
        if not isinstance(producer, dict):
            continue
        medias = producer.get("medias")
        if not isinstance(medias, list):
            continue
        for media in medias:
            token = str(media).strip().lower()
            if "audio" in token and (
                "sendonly" in token or "sendrecv" in token
            ):
                return True
    return False


async def _async_context(
    hass: HomeAssistant, entity_id: str
) -> tuple[_CapabilityClient, str, str] | None:
    """Resolve one HA Frigate entity without affecting generic HA cameras."""
    registry_entry = er.async_get(hass).async_get(entity_id)
    if (
        registry_entry is None
        or registry_entry.platform != "frigate"
        or registry_entry.config_entry_id is None
    ):
        return None
    config_entry = hass.config_entries.async_get_entry(registry_entry.config_entry_id)
    if config_entry is None:
        return None
    base_url = config_entry.data.get(CONF_URL)
    state = hass.states.get(entity_id)
    camera_name = state.attributes.get("camera_name") if state else None
    if not isinstance(base_url, str) or not isinstance(camera_name, str):
        return None
    camera_name = camera_name.strip()
    if not camera_name:
        return None
    client = await async_get_frigate_client(hass, config_entry)
    if client is None:
        return None
    return cast(_CapabilityClient, client), camera_name, base_url
