"""Two-way-audio capability use cases."""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.core import HomeAssistant


@dataclass(frozen=True, slots=True)
class TalkCapability:
    """Home Assistant's native result and legacy-probe eligibility."""

    supported: bool
    probe_required: bool


def camera_talk_capability(hass: HomeAssistant, entity_id: str) -> TalkCapability:
    """Resolve native support or eligibility for an HA signaling probe.

    Home Assistant added this capability after the original WebRTC stream flag.
    Older Core and camera integrations fall back to a microphone-free WebRTC
    answer probe instead of treating ordinary WebRTC playback as proof of a
    camera backchannel.
    """
    from homeassistant.components.camera.helper import get_camera_from_entity_id

    camera = get_camera_from_entity_id(hass, entity_id)
    return _resolve_talk_capability(camera.camera_capabilities)


def _resolve_talk_capability(capabilities: object) -> TalkCapability:
    """Feature-detect native support and legacy WebRTC probe eligibility."""
    supported = getattr(capabilities, "two_way_audio", False) is True
    stream_types = getattr(capabilities, "frontend_stream_types", ())
    has_webrtc = any(
        str(getattr(stream_type, "value", stream_type)).lower()
        in {"web_rtc", "webrtc"}
        for stream_type in stream_types
    )
    return TalkCapability(
        supported=supported,
        probe_required=not supported and has_webrtc,
    )
