"""Provider-neutral activity update subscription contract."""

from __future__ import annotations

from collections.abc import Callable
from typing import Literal, Protocol

from homeassistant.core import HomeAssistant

ActivityUpdateKind = Literal["events", "reviews"]
ActivityUpdateListener = Callable[[], None]


class ActivityUpdatesProvider(Protocol):
    """Optional provider capability for real-time activity invalidation."""

    async def async_subscribe_activity_updates(
        self,
        hass: HomeAssistant,
        entity_id: str,
        kind: ActivityUpdateKind,
        listener: ActivityUpdateListener,
    ) -> Callable[[], None]:
        """Notify the listener when authoritative activity may have changed."""
