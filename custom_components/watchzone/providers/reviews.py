"""Provider-neutral review activity contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from homeassistant.core import HomeAssistant

from .media import PlaybackSource, PlaybackTransport

ReviewClassification = Literal["alert", "detection"]
ReviewTrackingEventKind = Literal[
    "detected", "entered_zone", "became_active", "became_stationary", "left"
]


@dataclass(frozen=True, slots=True)
class ReviewTrackingEvent:
    """One provider-normalized moment in a tracked object's lifecycle."""

    kind: ReviewTrackingEventKind
    timestamp: float
    score: float | None
    ratio: float | None
    area: int | None
    area_percentage: float | None
    zones: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ReviewTrackedObject:
    """One object associated with a review and its ordered lifecycle."""

    id: str
    label: str
    sub_label: str | None
    start_time: float
    end_time: float | None
    events: tuple[ReviewTrackingEvent, ...]


@dataclass(frozen=True, slots=True)
class ReviewTrackingDetails:
    """Tracking details for one provider-owned review."""

    review_id: str
    objects: tuple[ReviewTrackedObject, ...]


@dataclass(frozen=True, slots=True)
class ReviewQuery:
    """One bounded, camera-scoped review query."""

    after: float
    before: float
    limit: int
    bypass_cache: bool = False
    enrich: bool = True


@dataclass(frozen=True, slots=True)
class ReviewItem:
    """Normalized activity presentation data."""

    id: str
    camera: str
    classification: ReviewClassification
    labels: tuple[str, ...]
    sub_labels: tuple[str, ...]
    start_time: float
    end_time: float | None
    media_start_time: float
    media_end_time: float
    related_event_ids: tuple[str, ...]
    reviewed: bool
    analysis_title: str | None
    analysis_description: str | None
    analysis_score: float | None
    analysis_concerns: tuple[str, ...]
    preview_url: str | None
    thumbnail_url: str | None
    snapshot_url: str | None
    clip_url: str | None
    download_url: str | None
    playback_sources: tuple[PlaybackSource, ...]
    preferred_transport: PlaybackTransport
    zones: tuple[str, ...]
    revision: str


class ReviewsProvider(Protocol):
    """Optional provider capability for authoritative review windows."""

    async def async_list_reviews(
        self, hass: HomeAssistant, entity_id: str, query: ReviewQuery
    ) -> list[ReviewItem]:
        """Return newest-first review activity for one camera."""

    async def async_set_reviewed(
        self,
        hass: HomeAssistant,
        entity_id: str,
        review_id: str,
        reviewed: bool,
    ) -> None:
        """Set the reviewed state of one provider-owned review."""

    async def async_get_tracking_details(
        self, hass: HomeAssistant, entity_id: str, review_id: str
    ) -> ReviewTrackingDetails:
        """Return provider-normalized tracking details for one review."""
