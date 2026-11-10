"""Provider-resolved recording query service."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er

from ..extensions import ProviderRegistry
from ..providers.recordings import RecordingQuery, RecordingWindow


class RecordingsService:
    """Resolve recordings without exposing provider details to the frontend."""

    def __init__(self, hass: HomeAssistant, providers: ProviderRegistry) -> None:
        self._hass = hass
        self._providers = providers

    async def async_list(
        self, entity_id: str, query: RecordingQuery
    ) -> RecordingWindow:
        """Return one camera's recording availability and selected day."""
        entry = er.async_get(self._hass).async_get(entity_id)
        provider = self._providers.recordings(entry.platform) if entry else None
        if provider is None:
            raise HomeAssistantError("Recordings are unavailable for this camera")
        return await provider.async_list_recordings(self._hass, entity_id, query)

    async def async_close(self) -> None:
        """Release service resources."""
