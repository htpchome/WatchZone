"""Provider contract for two-way-audio capability discovery."""

from typing import Protocol

from homeassistant.core import HomeAssistant


class TalkCapabilityProvider(Protocol):
    async def async_capability(
        self, hass: HomeAssistant, entity_id: str
    ) -> bool:
        """Return whether the selected provider supports talk."""
