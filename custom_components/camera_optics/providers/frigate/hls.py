"""Authenticated HLS source preparation for Frigate cameras."""

from typing import Protocol, cast

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from .source import async_resolve_source


class _Stream(Protocol):
    def add_provider(self, fmt: str) -> object:
        """Add or reuse an output provider."""

    async def start(self) -> None:
        """Start the shared stream worker."""

    def endpoint_url(self, fmt: str) -> str:
        """Return the authenticated output endpoint."""


class _Camera(Protocol):
    entity_id: str
    stream_options: dict[str, str | bool | float]

    async def async_create_stream(self) -> _Stream | None:
        """Create or reuse the camera's stream worker."""


_streams: dict[str, _Stream] = {}


async def async_prepare_hls_endpoint(
    hass: HomeAssistant, entity_id: str, source_key: str | None = None
) -> str:
    """Expose HLS from one backend-validated Frigate go2rtc source."""
    source = (
        await async_resolve_source(hass, entity_id)
        if source_key is None
        else await async_resolve_source(hass, entity_id, source_key=source_key)
    )
    camera = _camera(hass, entity_id)
    if source_key is None:
        stream = await camera.async_create_stream()
    else:
        if source.stream_source is None:
            raise HomeAssistantError("Selected Frigate stream is unavailable")
        from homeassistant.components.camera.prefs import (
            get_dynamic_camera_stream_settings,
        )
        from homeassistant.components.stream import create_stream

        stream = _streams.get(source.source_id)
        if stream is None:
            stream = create_stream(
                hass,
                source.stream_source,
                options=camera.stream_options,
                dynamic_stream_settings=await get_dynamic_camera_stream_settings(
                    hass, entity_id
                ),
                stream_label=f"{entity_id}:{source.stream_name}",
            )
            _streams[source.source_id] = stream
    if stream is None:
        raise HomeAssistantError("Frigate camera does not expose a stream")
    stream.add_provider("hls")
    await stream.start()
    return stream.endpoint_url("hls")


class FrigateLiveHlsProvider:
    """Prepare HLS for the explicitly selected Frigate connection."""

    async def async_prepare_hls(
        self, hass: HomeAssistant, entity_id: str, source_key: str | None = None
    ) -> str:
        return await async_prepare_hls_endpoint(hass, entity_id, source_key)


live_hls = FrigateLiveHlsProvider()


def _camera(hass: HomeAssistant, entity_id: str) -> _Camera:
    """Resolve through Home Assistant lazily during runtime setup."""
    from homeassistant.components.camera.helper import get_camera_from_entity_id

    return cast(_Camera, get_camera_from_entity_id(hass, entity_id))
