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
    async def async_create_stream(self) -> _Stream | None:
        """Create or reuse the camera's stream worker."""


async def async_prepare_hls_endpoint(
    hass: HomeAssistant, entity_id: str
) -> str:
    """Expose HLS from one backend-validated Frigate go2rtc source."""
    await async_resolve_source(hass, entity_id)
    camera = _camera(hass, entity_id)
    stream = await camera.async_create_stream()
    if stream is None:
        raise HomeAssistantError("Frigate camera does not expose a stream")
    stream.add_provider("hls")
    await stream.start()
    return stream.endpoint_url("hls")


class FrigateLiveHlsProvider:
    """Prepare HLS for the explicitly selected Frigate connection."""

    async def async_prepare_hls(
        self, hass: HomeAssistant, entity_id: str
    ) -> str:
        return await async_prepare_hls_endpoint(hass, entity_id)


live_hls = FrigateLiveHlsProvider()


def _camera(hass: HomeAssistant, entity_id: str) -> _Camera:
    """Resolve through Home Assistant lazily during runtime setup."""
    from homeassistant.components.camera.helper import get_camera_from_entity_id

    return cast(_Camera, get_camera_from_entity_id(hass, entity_id))
