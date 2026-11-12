"""Explicit live-connection capability resolution."""

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from ..extensions import ProviderRegistry, get_provider_registry
from ..providers.live import ProviderPreparationError
from ..providers.live_connection import LiveSourceDescriptor


class LiveConnectionService:
    """Resolve the exact connection selected by the user."""

    def __init__(
        self,
        hass: HomeAssistant,
        providers: ProviderRegistry | None = None,
    ) -> None:
        self._hass = hass
        self._providers = providers or get_provider_registry(hass)

    async def async_resolve_source(
        self, provider_id: str, entity_id: str
    ) -> LiveSourceDescriptor:
        """Resolve a source without substituting another connection."""
        provider = self._providers.live_source_provider(provider_id)
        if provider is None:
            raise HomeAssistantError("Selected connection provider is unavailable")
        try:
            return await provider.async_resolve_source(self._hass, entity_id)
        except ProviderPreparationError as err:
            raise HomeAssistantError(
                "Selected connection provider is unavailable"
            ) from err

    async def async_prepare_hls(self, provider_id: str, entity_id: str) -> str:
        """Prepare HLS through the explicitly selected connection."""
        provider = self._providers.live_hls_provider(provider_id)
        if provider is None:
            raise HomeAssistantError("Selected connection does not support HLS")
        try:
            return await provider.async_prepare_hls(self._hass, entity_id)
        except ProviderPreparationError as err:
            raise HomeAssistantError(
                "Selected connection provider is unavailable"
            ) from err

    async def async_talk_capability(
        self, provider_id: str, entity_id: str
    ) -> bool:
        """Resolve talk support through the selected connection only."""
        provider = self._providers.talk_capability_provider(provider_id)
        if provider is None:
            return False
        return await provider.async_talk_capability(self._hass, entity_id)
