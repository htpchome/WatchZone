"""Two-way-audio capability discovery for the Home Assistant provider."""

from __future__ import annotations

from homeassistant.core import HomeAssistant

from ..frigate.capabilities import async_two_way_audio_capability


async def async_talk_capability(
    hass: HomeAssistant, entity_id: str
) -> bool:
    """Resolve native HA support or an explicit compatibility signal."""
    from homeassistant.components.camera.helper import get_camera_from_entity_id

    camera = get_camera_from_entity_id(hass, entity_id)
    native, has_webrtc = _resolve_native_talk_capability(
        camera.camera_capabilities
    )
    if native or not has_webrtc:
        return native
    return await async_two_way_audio_capability(hass, entity_id) is True


class HomeAssistantTalkCapabilityProvider:
    """Discover talk support for the selected Home Assistant connection."""

    async def async_talk_capability(
        self, hass: HomeAssistant, entity_id: str
    ) -> bool:
        return await async_talk_capability(hass, entity_id)


talk_capability = HomeAssistantTalkCapabilityProvider()


def _resolve_native_talk_capability(capabilities: object) -> tuple[bool, bool]:
    """Return native two-way audio and legacy WebRTC eligibility."""
    supported = getattr(capabilities, "two_way_audio", False) is True
    stream_types = getattr(capabilities, "frontend_stream_types", ())
    has_webrtc = any(
        str(getattr(stream_type, "value", stream_type)).lower()
        in {"web_rtc", "webrtc"}
        for stream_type in stream_types
    )
    return supported, has_webrtc
