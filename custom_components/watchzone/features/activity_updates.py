"""Provider-resolved real-time activity update sources."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er

from ..extensions import ProviderRegistry
from ..providers.activity_updates import ActivityUpdateSource


class ActivityUpdatesService:
    """Resolve frontend subscriptions without exposing provider lookup rules."""

    def __init__(self, hass: HomeAssistant, providers: ProviderRegistry) -> None:
        self._hass = hass
        self._providers = providers

    async def async_source(self, entity_id: str) -> ActivityUpdateSource:
        """Return the owning provider's activity update source."""
        entry = er.async_get(self._hass).async_get(entity_id)
        provider = self._providers.activity_updates(entry.platform) if entry else None
        if provider is None:
            raise HomeAssistantError(
                "Real-time activity is unavailable for this camera"
            )
        return await provider.async_activity_update_source(self._hass, entity_id)
