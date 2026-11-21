"""Provider contracts for explicit live-connection capabilities."""

from dataclasses import dataclass
from typing import Protocol

from homeassistant.core import HomeAssistant

from .live import LiveSignalingSession, SendLiveSignalingEvent


@dataclass(frozen=True, slots=True)
class LiveSourceDescriptor:
    """Provider-neutral browser source identity."""

    id: str
    type: str
    frigate_instance_id: str | None = None
    stream_name: str | None = None
    substream: bool = False


class LiveSourceProvider(Protocol):
    """Resolve one explicitly selected live connection."""

    async def async_resolve_source(
        self, hass: HomeAssistant, entity_id: str
    ) -> LiveSourceDescriptor:
        """Return a normalized source descriptor."""


class LiveHlsProvider(Protocol):
    """Prepare an authenticated HLS endpoint for a live connection."""

    async def async_prepare_hls(self, hass: HomeAssistant, entity_id: str) -> str:
        """Return an authenticated endpoint URL."""


class LiveSubstreamProvider(Protocol):
    """Discover and prepare provider-native live-only substreams."""

    async def async_list_substreams(
        self, hass: HomeAssistant, entity_id: str
    ) -> tuple[str, ...]:
        """Return validated substreams belonging to one camera."""

    async def async_resolve_substream(
        self, hass: HomeAssistant, entity_id: str, stream_name: str
    ) -> LiveSourceDescriptor:
        """Resolve one validated substream descriptor."""

    async def async_prepare_substream_session(
        self,
        hass: HomeAssistant,
        entity_id: str,
        stream_name: str,
        send_event: SendLiveSignalingEvent,
    ) -> LiveSignalingSession:
        """Prepare signaling for one validated substream."""


class TalkCapabilityProvider(Protocol):
    """Discover truthful two-way-audio support for a live connection."""

    async def async_talk_capability(self, hass: HomeAssistant, entity_id: str) -> bool:
        """Return whether this connection supports talk."""
