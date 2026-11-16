"""Provider-neutral event query contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from homeassistant.core import HomeAssistant

from .media import PlaybackSource, PlaybackTransport


@dataclass(frozen=True, slots=True)
class EventQuery:
    """One bounded, camera-scoped event query."""

    after: float
    before: float
    limit: int
    bypass_cache: bool = False


@dataclass(frozen=True, slots=True)
class EventItem:
    """Normalized event presentation data."""

    id: str
    camera: str
    label: str
    sub_label: str | None
    score: float | None
    start_time: float
    end_time: float | None
    has_snapshot: bool
    has_clip: bool
    thumbnail_url: str | None
    snapshot_url: str | None
    clip_url: str | None
    playback_sources: tuple[PlaybackSource, ...]
    preferred_transport: PlaybackTransport
    zones: tuple[str, ...]
    revision: str


class EventsProvider(Protocol):
    """Optional provider capability for authoritative event windows."""

    async def async_get_event(
        self, hass: HomeAssistant, entity_id: str, event_id: str
    ) -> EventItem | None:
        """Return one provider-owned event by ID when it exists."""

    async def async_list_events(
        self, hass: HomeAssistant, entity_id: str, query: EventQuery
    ) -> list[EventItem]:
        """Return newest-first events for one camera."""
