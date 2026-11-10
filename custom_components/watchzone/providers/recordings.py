"""Provider-neutral recording-range contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from homeassistant.core import HomeAssistant

from .media import PlaybackSource, PlaybackTransport


@dataclass(frozen=True, slots=True)
class RecordingQuery:
    """One camera-scoped recording-day query."""

    selected_date: str
    timezone: str


@dataclass(frozen=True, slots=True)
class RecordingHour:
    """One provider-normalized hourly recording range."""

    id: str
    camera: str
    start_time: float
    end_time: float
    duration: float
    playback_sources: tuple[PlaybackSource, ...]
    preferred_transport: PlaybackTransport
    download_url: str
    revision: str


@dataclass(frozen=True, slots=True)
class RecordingWindow:
    """Available recording days and the selected day's hourly ranges."""

    days: tuple[str, ...]
    hours: tuple[RecordingHour, ...]


class RecordingsProvider(Protocol):
    """Optional provider capability for recording availability and ranges."""

    async def async_list_recordings(
        self, hass: HomeAssistant, entity_id: str, query: RecordingQuery
    ) -> RecordingWindow:
        """Return available days and newest-first hourly ranges."""
