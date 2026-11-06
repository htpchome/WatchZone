"""Frigate two-way-audio capability."""

from homeassistant.core import HomeAssistant

from .capabilities import async_two_way_audio_capability


async def async_capability(hass: HomeAssistant, entity_id: str) -> bool:
    return await async_two_way_audio_capability(hass, entity_id) is True
