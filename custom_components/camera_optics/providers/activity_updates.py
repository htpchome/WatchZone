"""Provider-neutral real-time activity update contract."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal, Protocol

from homeassistant.core import HomeAssistant

from .reviews import ReviewClassification, ReviewItem

ActivityUpdateKind = Literal["events", "reviews"]
ActivityUpdatePhase = Literal["end", "new", "update"]


@dataclass(frozen=True, slots=True)
class ActivityUpdateNotification:
    """One provider-normalized activity change."""

    camera_name: str
    topic: ActivityUpdateKind
    classification: ReviewClassification | None = None
    id: str | None = None
    phase: ActivityUpdatePhase | None = None
    review: ReviewItem | None = None


ActivityUpdateCallback = Callable[[ActivityUpdateNotification], None]
ActivityUpdateUnsubscribe = Callable[[], None]


class ActivityUpdatesProvider(Protocol):
    """Optional provider capability for normalized real-time activity."""

    async def async_subscribe_activity_updates(
        self,
        hass: HomeAssistant,
        entity_id: str,
        kind: ActivityUpdateKind,
        callback: ActivityUpdateCallback,
    ) -> ActivityUpdateUnsubscribe:
        """Subscribe to normalized activity for one provider-owned camera."""
