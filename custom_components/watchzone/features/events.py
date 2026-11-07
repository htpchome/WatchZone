"""Provider-resolved event query service."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er

from ..extensions import ProviderRegistry
from ..providers.events import EventItem, EventQuery


class EventsService:
    """Resolve event data without exposing provider details to the frontend."""

    def __init__(self, hass: HomeAssistant, providers: ProviderRegistry) -> None:
        self._hass = hass
        self._providers = providers

    async def async_list(self, entity_id: str, query: EventQuery) -> list[EventItem]:
        """Return one authoritative event window for an HA camera."""
        entry = er.async_get(self._hass).async_get(entity_id)
        provider = self._providers.events(entry.platform) if entry else None
        if provider is None:
            raise HomeAssistantError("Events are unavailable for this camera")
        return await provider.async_list_events(self._hass, entity_id, query)

    async def async_close(self) -> None:
        """Release service resources."""
