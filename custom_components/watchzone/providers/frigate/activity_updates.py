"""Frigate activity update source resolution."""

from __future__ import annotations

from homeassistant.core import HomeAssistant

from ..activity_updates import ActivityUpdateSource, ActivityUpdatesProvider
from .source import async_resolve_source


class FrigateActivityUpdatesProvider:
    """Resolve a camera to the owning Frigate WebSocket proxy identity."""

    async def async_activity_update_source(
        self,
        hass: HomeAssistant,
        entity_id: str,
    ) -> ActivityUpdateSource:
        source = await async_resolve_source(hass, entity_id)
        return ActivityUpdateSource(
            type="frigate",
            instance_id=source.frigate_instance_id,
            camera_name=source.camera_name,
        )


activity_updates: ActivityUpdatesProvider = FrigateActivityUpdatesProvider()
