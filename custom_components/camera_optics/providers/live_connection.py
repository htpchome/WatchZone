"""Provider contracts for explicit live-connection capabilities."""

from dataclasses import dataclass
from typing import Protocol

from homeassistant.core import HomeAssistant


@dataclass(frozen=True, slots=True)
class LiveSourceDescriptor:
    """Provider-neutral browser source identity."""

    id: str
    type: str
    frigate_instance_id: str | None = None
    stream_name: str | None = None
    source_key: str | None = None


@dataclass(frozen=True, slots=True)
class LiveSourceOption:
    """One user-selectable live-only source."""

    key: str
    label: str


class LiveSourceProvider(Protocol):
    """Resolve one explicitly selected live connection."""

    async def async_resolve_source(
        self, hass: HomeAssistant, entity_id: str, source_key: str | None = None
    ) -> LiveSourceDescriptor:
        """Return a normalized source descriptor."""

    async def async_list_sources(
        self, hass: HomeAssistant, entity_id: str
    ) -> tuple[LiveSourceOption, ...]:
        """Return live-only sources associated with the camera."""


class LiveHlsProvider(Protocol):
    """Prepare an authenticated HLS endpoint for a live connection."""

    async def async_prepare_hls(
        self, hass: HomeAssistant, entity_id: str, source_key: str | None = None
    ) -> str:
        """Return an authenticated endpoint URL."""


class TalkCapabilityProvider(Protocol):
    """Discover truthful two-way-audio support for a live connection."""

    async def async_talk_capability(self, hass: HomeAssistant, entity_id: str) -> bool:
        """Return whether this connection supports talk."""
