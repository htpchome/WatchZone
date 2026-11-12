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


class LiveSourceProvider(Protocol):
    """Resolve one explicitly selected live connection."""

    async def async_resolve_source(
        self, hass: HomeAssistant, entity_id: str
    ) -> LiveSourceDescriptor:
        """Return a normalized source descriptor."""


class LiveHlsProvider(Protocol):
    """Prepare an authenticated HLS endpoint for a live connection."""

    async def async_prepare_hls(
        self, hass: HomeAssistant, entity_id: str
    ) -> str:
        """Return an authenticated endpoint URL."""


class TalkCapabilityProvider(Protocol):
    """Discover truthful two-way-audio support for a live connection."""

    async def async_talk_capability(
        self, hass: HomeAssistant, entity_id: str
    ) -> bool:
        """Return whether this connection supports talk."""
