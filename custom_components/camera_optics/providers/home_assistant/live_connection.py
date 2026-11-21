"""Home Assistant direct live-source capability."""

from homeassistant.core import HomeAssistant

from ..live_connection import LiveSourceDescriptor, LiveSourceOption


class HomeAssistantLiveSourceProvider:
    """Describe the selected Home Assistant camera connection."""

    async def async_resolve_source(
        self, hass: HomeAssistant, entity_id: str, source_key: str | None = None
    ) -> LiveSourceDescriptor:
        del hass
        return LiveSourceDescriptor(
            id=f"home_assistant:{entity_id}",
            type="home_assistant",
        )

    async def async_list_sources(
        self, hass: HomeAssistant, entity_id: str
    ) -> tuple[LiveSourceOption, ...]:
        return ()


live_source = HomeAssistantLiveSourceProvider()
