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
from .source import FrigateClient, async_get_frigate_client

_CAPABILITY_TIMEOUT = ClientTimeout(total=5)
_TALK_CAPABILITY_KEYS = frozenset(
    {
        "audio_out",
        "audio_output",
        "backchannel",
        "mic",
        "microphone",
        "supports_two_way_audio",
        "supports_two_way_talk",
        "talk",
        "talkback",
        "two_way_audio",
        "two_way_talk",
    }
)
_TALK_CAPABILITY_COLLECTIONS = frozenset({"capabilities", "features"})


class _CapabilityClient(FrigateClient, Protocol):
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
        session = async_get_clientsession(hass)
        payload: object | None = None
        for url, params in _stream_metadata_requests(base_url, camera_name):
            response = await session.get(
                url,
                params=params,
                headers=headers,
                ssl=client.validate_ssl,
                timeout=_CAPABILITY_TIMEOUT,
            )
            async with response:
                if response.status != 200:
                    continue
                payload = await response.json(content_type=None)
                break
    except Exception:
        return False
    return payload is not None and _has_audio_backchannel(payload)


class FrigateTalkCapabilityProvider:
    """Discover talk support for an explicitly selected Frigate connection."""

    async def async_talk_capability(
        self, hass: HomeAssistant, entity_id: str
    ) -> bool:
        return await async_two_way_audio_capability(hass, entity_id) is True


talk_capability = FrigateTalkCapabilityProvider()


def _stream_metadata_requests(
    base_url: str, camera_name: str
) -> tuple[tuple[URL, dict[str, str]], ...]:
    """Return current and legacy Frigate go2rtc metadata routes."""
    media = {"video": "all", "audio": "all", "microphone": ""}
    return (
        (
            URL(base_url) / "api/go2rtc/streams" / camera_name,
            media,
        ),
        (
            URL(base_url) / "api/go2rtc/api/streams",
            {"src": camera_name, **media},
        ),
    )


def _has_audio_backchannel(payload: object) -> bool:
    """Recognize an audio producer or an explicit provider capability marker."""
    return _has_send_audio_producer(payload) or _has_explicit_talk_marker(payload)


def _has_send_audio_producer(payload: object) -> bool:
    """Find a browser-to-camera audio producer in nested stream metadata."""
    if isinstance(payload, list):
        return any(_has_send_audio_producer(value) for value in payload)
    if not isinstance(payload, dict):
        return False
    producers = payload.get("producers")
    if isinstance(producers, list):
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
    return any(_has_send_audio_producer(value) for value in payload.values())


def _has_explicit_talk_marker(payload: object) -> bool:
    """Find only explicit capability fields, never generic camera labels."""
    if isinstance(payload, list):
        return any(_has_explicit_talk_marker(value) for value in payload)
    if not isinstance(payload, dict):
        return False
    for key, value in payload.items():
        normalized_key = str(key).strip().lower().replace("-", "_")
        if normalized_key in _TALK_CAPABILITY_KEYS and value is True:
            return True
        if normalized_key in _TALK_CAPABILITY_COLLECTIONS and _contains_talk_token(
            value
        ):
            return True
        if isinstance(value, (dict, list)) and _has_explicit_talk_marker(value):
            return True
    return False


def _contains_talk_token(value: object) -> bool:
    """Inspect one explicit feature/capability collection."""
    if isinstance(value, str):
        return value.strip().lower().replace("-", "_") in _TALK_CAPABILITY_KEYS
    if isinstance(value, list):
        return any(_contains_talk_token(item) for item in value)
    if isinstance(value, dict):
        return any(
            _contains_talk_token(item)
            for key, item in value.items()
            if str(key).strip().lower() in {"name", "type", "value"}
        )
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
