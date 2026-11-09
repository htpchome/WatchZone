"""Provider-neutral activity update source contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from homeassistant.core import HomeAssistant


@dataclass(frozen=True, slots=True)
class ActivityUpdateSource:
    """Frontend subscription identity for one provider-owned camera."""

    type: Literal["frigate"]
    instance_id: str
    camera_name: str


class ActivityUpdatesProvider(Protocol):
    """Optional provider capability for resolving real-time activity."""

    async def async_activity_update_source(
        self,
        hass: HomeAssistant,
        entity_id: str,
    ) -> ActivityUpdateSource:
        """Resolve one camera to its provider-owned update source."""
