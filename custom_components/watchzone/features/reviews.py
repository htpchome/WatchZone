"""Provider-resolved review query service."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er

from ..extensions import ProviderRegistry
from ..providers.reviews import ReviewItem, ReviewQuery, ReviewTrackingDetails


class ReviewsService:
    """Resolve review data without exposing provider details to the frontend."""

    def __init__(self, hass: HomeAssistant, providers: ProviderRegistry) -> None:
        self._hass = hass
        self._providers = providers

    async def async_list(
        self, entity_id: str, query: ReviewQuery
    ) -> list[ReviewItem]:
        """Return one authoritative review window for a Home Assistant camera."""
        entry = er.async_get(self._hass).async_get(entity_id)
        provider = self._providers.reviews(entry.platform) if entry else None
        if provider is None:
            raise HomeAssistantError("Reviews are unavailable for this camera")
        return await provider.async_list_reviews(self._hass, entity_id, query)

    async def async_set_reviewed(
        self, entity_id: str, review_id: str, reviewed: bool
    ) -> None:
        """Set one review's state through its owning provider."""
        entry = er.async_get(self._hass).async_get(entity_id)
        provider = self._providers.reviews(entry.platform) if entry else None
        if provider is None:
            raise HomeAssistantError("Reviews are unavailable for this camera")
        await provider.async_set_reviewed(
            self._hass, entity_id, review_id, reviewed
        )

    async def async_get_tracking_details(
        self, entity_id: str, review_id: str
    ) -> ReviewTrackingDetails:
        """Return tracking details through the camera's reviews provider."""
        entry = er.async_get(self._hass).async_get(entity_id)
        provider = self._providers.reviews(entry.platform) if entry else None
        if provider is None:
            raise HomeAssistantError("Review tracking details are unavailable")
        return await provider.async_get_tracking_details(
            self._hass, entity_id, review_id
        )

    async def async_close(self) -> None:
        """Release service resources."""
