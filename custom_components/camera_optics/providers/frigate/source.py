"""Resolve one Frigate camera to its owning integration instance and stream."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import TYPE_CHECKING, Protocol, cast

from aiohttp import ClientTimeout
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_URL
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.importlib import async_import_module
from yarl import URL

from ..live import ProviderPreparationError
from ..live_connection import LiveSourceDescriptor

_SUBSTREAM_DISCOVERY_TIMEOUT = ClientTimeout(total=5)

if TYPE_CHECKING:
    from homeassistant.components.camera import Camera


class FrigateClient(Protocol):
    """Narrow public Frigate client surface used by CameraOptics."""

    validate_ssl: bool

    async def get_auth_headers(self) -> dict[str, str]:
        """Return current Frigate authentication headers."""

    async def async_get_version(self) -> str:
        """Return the connected Frigate server version."""


@dataclass(frozen=True, slots=True)
class FrigateSource:
    """Validated identity for one camera on one Frigate integration instance."""

    base_url: str
    camera_name: str
    client: FrigateClient
    config_entry: ConfigEntry
    frigate_instance_id: str
    stream_name: str

    @property
    def source_id(self) -> str:
        """Return an identity that cannot collide across Frigate instances."""
        return f"frigate_go2rtc:{self.config_entry.entry_id}:{self.stream_name}"


@dataclass(frozen=True, slots=True)
class FrigateActivityIdentity:
    """Identity required by Frigate's activity MQTT feed."""

    camera_name: str
    frigate_instance_id: str
    topic_prefix: str


async def async_resolve_activity_identity(
    hass: HomeAssistant, entity_id: str
) -> FrigateActivityIdentity:
    """Resolve activity identity without acquiring or validating live media."""
    registry_entry = er.async_get(hass).async_get(entity_id)
    if registry_entry is None or registry_entry.platform != "frigate":
        raise ProviderPreparationError("frigate_entity_mismatch")

    camera_name = _camera_name(hass, entity_id)
    if not camera_name:
        raise ProviderPreparationError("frigate_camera_name_unavailable")

    state = hass.states.get(entity_id)
    value = state.attributes.get("client_id") if state else None
    instance_id = value.strip() if isinstance(value, str) else None
    if not instance_id and registry_entry.config_entry_id is not None:
        config_entry = hass.config_entries.async_get_entry(
            registry_entry.config_entry_id
        )
        if config_entry is not None:
            module = await _async_views_module(hass)
            instance_id = _instance_id(module, hass, config_entry)
    if not instance_id:
        raise ProviderPreparationError("frigate_instance_id_unavailable")
    if registry_entry.config_entry_id is None:
        raise ProviderPreparationError("frigate_config_entry_missing")
    frigate_data = hass.data.get("frigate", {}).get(registry_entry.config_entry_id, {})
    config = frigate_data.get("config") if isinstance(frigate_data, dict) else None
    mqtt_config = config.get("mqtt") if isinstance(config, dict) else None
    topic_prefix = (
        mqtt_config.get("topic_prefix") if isinstance(mqtt_config, dict) else None
    )
    if not isinstance(topic_prefix, str) or not topic_prefix.strip():
        raise ProviderPreparationError("frigate_activity_topic_unavailable")

    return FrigateActivityIdentity(
        camera_name=camera_name,
        frigate_instance_id=instance_id,
        topic_prefix=topic_prefix.strip(),
    )


async def async_resolve_source(
    hass: HomeAssistant, entity_id: str, camera: Camera | None = None
) -> FrigateSource:
    """Resolve a camera through its owning Frigate config entry."""
    registry_entry = er.async_get(hass).async_get(entity_id)
    if (
        registry_entry is None
        or registry_entry.platform != "frigate"
        or registry_entry.config_entry_id is None
    ):
        raise ProviderPreparationError("frigate_entity_mismatch")

    config_entry = hass.config_entries.async_get_entry(registry_entry.config_entry_id)
    if config_entry is None:
        raise ProviderPreparationError("frigate_config_entry_missing")
    base_url = config_entry.data.get(CONF_URL)
    if not isinstance(base_url, str):
        raise ProviderPreparationError("frigate_url_missing")

    camera_name = _camera_name(hass, entity_id)
    if camera is None:
        from homeassistant.components.camera.helper import get_camera_from_entity_id

        try:
            camera = get_camera_from_entity_id(hass, entity_id)
        except HomeAssistantError:
            camera = None
    stream_source: str | None = None
    if camera is not None:
        try:
            stream_source = await camera.stream_source()
        except HomeAssistantError:
            pass
    # Frigate's public camera entity can reject access while it is turned off.
    # Its stable public camera_name still identifies the configured go2rtc
    # source; suspension is enforced independently by camera runtime.
    stream_name = _stream_name(stream_source, base_url) or camera_name
    if stream_name is None:
        reason = (
            "frigate_stream_source_incompatible"
            if stream_source
            else "frigate_stream_source_unavailable"
        )
        raise ProviderPreparationError(reason)

    module = await _async_views_module(hass)
    client = _client_for_entry(module, hass, config_entry)
    if client is None:
        raise ProviderPreparationError("frigate_client_unavailable")
    instance_id = _instance_id(module, hass, config_entry)
    if instance_id is None:
        state = hass.states.get(entity_id)
        value = state.attributes.get("client_id") if state else None
        instance_id = value.strip() if isinstance(value, str) else None
    if not instance_id:
        raise ProviderPreparationError("frigate_instance_id_unavailable")

    return FrigateSource(
        base_url=base_url,
        camera_name=camera_name or stream_name,
        client=client,
        config_entry=config_entry,
        frigate_instance_id=instance_id,
        stream_name=stream_name,
    )


async def async_list_substreams(hass: HomeAssistant, entity_id: str) -> tuple[str, ...]:
    """List validated go2rtc streams belonging to one Frigate camera."""
    source = await async_resolve_source(hass, entity_id)
    return await _async_list_substreams(hass, source)


async def _async_list_substreams(
    hass: HomeAssistant, source: FrigateSource
) -> tuple[str, ...]:
    """List substreams for one already resolved Frigate source."""
    try:
        headers = await source.client.get_auth_headers()
        session = async_get_clientsession(hass)
        payload: object | None = None
        for url in (
            URL(source.base_url) / "api/go2rtc/streams",
            URL(source.base_url) / "api/go2rtc/api/streams",
        ):
            response = await session.get(
                url,
                headers=headers,
                ssl=source.client.validate_ssl,
                timeout=_SUBSTREAM_DISCOVERY_TIMEOUT,
            )
            async with response:
                if response.status != 200:
                    continue
                payload = await response.json(content_type=None)
                break
    except Exception as err:
        raise ProviderPreparationError("frigate_substream_discovery_failed") from err
    if not isinstance(payload, dict):
        raise ProviderPreparationError("frigate_substream_discovery_failed")
    prefix = f"{source.camera_name.lower()}_"
    audio_stream = f"{source.camera_name.lower()}_audio"
    streams = {
        normalized
        for value in payload
        if (normalized := _normalize_stream_name(value)) is not None
        and normalized.lower().startswith(prefix)
        and normalized.lower() != audio_stream
        and normalized != source.stream_name
    }
    return tuple(sorted(streams, key=str.casefold))


async def async_resolve_substream_source(
    hass: HomeAssistant, entity_id: str, stream_name: str
) -> FrigateSource:
    """Resolve one live-only stream after proving it belongs to the camera."""
    normalized = _normalize_stream_name(stream_name)
    if normalized is None:
        raise ProviderPreparationError("frigate_substream_invalid")
    source = await async_resolve_source(hass, entity_id)
    if normalized not in await _async_list_substreams(hass, source):
        raise ProviderPreparationError("frigate_substream_unavailable")
    return replace(source, stream_name=normalized)


class FrigateLiveSourceProvider:
    """Resolve an explicitly selected Frigate go2rtc source."""

    async def async_resolve_source(
        self, hass: HomeAssistant, entity_id: str
    ) -> LiveSourceDescriptor:
        source = await async_resolve_source(hass, entity_id)
        return LiveSourceDescriptor(
            id=source.source_id,
            type="frigate_go2rtc",
            frigate_instance_id=source.frigate_instance_id,
            stream_name=source.stream_name,
        )


live_source = FrigateLiveSourceProvider()


def _normalize_stream_name(value: object) -> str | None:
    """Normalize one bounded go2rtc stream identifier."""
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if (
        not normalized
        or len(normalized) > 512
        or any(ord(character) < 32 or ord(character) == 127 for character in normalized)
    ):
        return None
    return normalized


async def async_get_frigate_client(
    hass: HomeAssistant, config_entry: ConfigEntry
) -> FrigateClient | None:
    """Feature-detect the installed integration's authenticated client."""
    try:
        module = await _async_views_module(hass)
    except ProviderPreparationError:
        return None
    return _client_for_entry(module, hass, config_entry)


async def _async_views_module(hass: HomeAssistant) -> object:
    try:
        return await async_import_module(hass, "custom_components.frigate.views")
    except ModuleNotFoundError as err:
        raise ProviderPreparationError("frigate_integration_unavailable") from err


def _client_for_entry(
    module: object, hass: HomeAssistant, config_entry: ConfigEntry
) -> FrigateClient | None:
    getter = getattr(module, "get_client_for_config_entry", None)
    if not callable(getter):
        return None
    client = cast(Callable[[HomeAssistant, ConfigEntry], object | None], getter)(
        hass, config_entry
    )
    if client is None or not hasattr(client, "get_auth_headers"):
        return None
    return cast(FrigateClient, client)


def _instance_id(
    module: object, hass: HomeAssistant, config_entry: ConfigEntry
) -> str | None:
    getter = getattr(module, "get_frigate_instance_id_for_config_entry", None)
    if not callable(getter):
        return None
    value = cast(Callable[[HomeAssistant, ConfigEntry], object], getter)(
        hass, config_entry
    )
    return value.strip() if isinstance(value, str) and value.strip() else None


def _stream_name(stream_source: str | None, frigate_url: str) -> str | None:
    if not stream_source:
        return None
    source = URL(stream_source)
    if (
        source.scheme not in {"rtsp", "rtsps"}
        or source.port != 8554
        or source.host != URL(frigate_url).host
    ):
        return None
    return source.path.strip("/") or None


def _camera_name(hass: HomeAssistant, entity_id: str) -> str | None:
    state = hass.states.get(entity_id)
    value = state.attributes.get("camera_name") if state else None
    return value.strip() if isinstance(value, str) and value.strip() else None
