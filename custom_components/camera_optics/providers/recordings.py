"""Provider-neutral recording-range contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from homeassistant.core import HomeAssistant

from .media import PlaybackSource, PlaybackTransport


@dataclass(frozen=True, slots=True)
class RecordingQuery:
    """One camera-scoped recording-day query."""

    selected_date: str
    timezone: str


@dataclass(frozen=True, slots=True)
class RecordingSpan:
    """One continuous playable span within a clock-hour timeline."""

    start_time: float
    end_time: float
    media_offset: float


@dataclass(frozen=True, slots=True)
class RecordingAvailabilitySpan:
    """One continuous playable span in the segment-selection window."""

    start_time: float
    end_time: float


@dataclass(frozen=True, slots=True)
class RecordingMarker:
    """One alert or detection positioned on a recording timeline."""

    id: str
    classification: Literal["alert", "detection"]
    start_time: float
    end_time: float
    thumbnail_url: str


@dataclass(frozen=True, slots=True)
class RecordingHour:
    """One provider-normalized hourly recording range."""

    id: str
    camera: str
    start_time: float
    end_time: float
    duration: float
    timeline_start_time: float
    timeline_end_time: float
    spans: tuple[RecordingSpan, ...]
    selection_start_time: float
    selection_end_time: float
    selection_spans: tuple[RecordingAvailabilitySpan, ...]
    markers: tuple[RecordingMarker, ...]
    playback_sources: tuple[PlaybackSource, ...]
    preferred_transport: PlaybackTransport
    download_url: str
    revision: str


@dataclass(frozen=True, slots=True)
class RecordingWindow:
    """Available recording days and the selected day's hourly ranges."""

    days: tuple[str, ...]
    hours: tuple[RecordingHour, ...]


@dataclass(frozen=True, slots=True)
class RecordingSegmentRequest:
    """One bounded user-selected recording segment."""

    start_time: float
    end_time: float


@dataclass(frozen=True, slots=True)
class RecordingSegmentMedia:
    """Provider-normalized playback and download for a selected segment."""

    path: str
    filename: str
    playback_sources: tuple[PlaybackSource, ...]
    preferred_transport: PlaybackTransport


class RecordingsProvider(Protocol):
    """Optional provider capability for recording availability and ranges."""

    async def async_list_recordings(
        self, hass: HomeAssistant, entity_id: str, query: RecordingQuery
    ) -> RecordingWindow:
        """Return available days and newest-first hourly ranges."""

    async def async_resolve_segment(
        self,
        hass: HomeAssistant,
        entity_id: str,
        request: RecordingSegmentRequest,
    ) -> RecordingSegmentMedia:
        """Resolve one bounded recording segment for preview and download."""
