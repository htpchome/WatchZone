"""Home Assistant direct live-source capability."""

from homeassistant.core import HomeAssistant

from ..live_connection import LiveSourceDescriptor


class HomeAssistantLiveSourceProvider:
    """Describe the selected Home Assistant camera connection."""

    async def async_resolve_source(
        self, hass: HomeAssistant, entity_id: str
    ) -> LiveSourceDescriptor:
        del hass
        return LiveSourceDescriptor(
            id=f"home_assistant:{entity_id}",
            type="home_assistant",
        )


live_source = HomeAssistantLiveSourceProvider()
