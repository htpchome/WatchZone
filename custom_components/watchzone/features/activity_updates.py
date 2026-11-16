"""Provider-resolved real-time activity updates."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er

from ..extensions import ProviderRegistry
from ..providers.activity_updates import (
    ActivityUpdateCallback,
    ActivityUpdateKind,
    ActivityUpdateUnsubscribe,
)


class ActivityUpdatesService:
    """Own provider resolution for normalized activity subscriptions."""

    def __init__(self, hass: HomeAssistant, providers: ProviderRegistry) -> None:
        self._hass = hass
        self._providers = providers

    async def async_subscribe(
        self,
        entity_id: str,
        kind: ActivityUpdateKind,
        callback: ActivityUpdateCallback,
    ) -> ActivityUpdateUnsubscribe:
        """Subscribe through the camera entity's owning provider."""
        entry = er.async_get(self._hass).async_get(entity_id)
        provider = self._providers.activity_updates(entry.platform) if entry else None
        if provider is None:
            raise HomeAssistantError(
                "Real-time activity is unavailable for this camera"
            )
        return await provider.async_subscribe_activity_updates(
            self._hass, entity_id, kind, callback
        )
