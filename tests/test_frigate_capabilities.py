"""Tests for explicit Frigate compatibility capability evidence."""

from custom_components.watchzone.providers.frigate.capabilities import (
    _has_audio_backchannel,
    _normalize_ptz_capabilities,
)


def test_talk_capability_requires_outgoing_audio_producer() -> None:
    """Ordinary camera audio playback must not advertise talkback."""
    payload = {
        "producers": [
            {"medias": ["video, recvonly, H264", "audio, recvonly, AAC"]}
        ]
    }

    assert _has_audio_backchannel(payload) is False


def test_talk_capability_accepts_explicit_backchannel() -> None:
    """A send-capable audio producer is truthful talkback evidence."""
    payload = {
        "producers": [
            {"medias": ["video, recvonly, H264", "audio, sendonly, PCMA"]}
        ]
    }

    assert _has_audio_backchannel(payload) is True


def test_ptz_capability_rejects_config_shape_without_runtime_features() -> None:
    """An ONVIF-shaped/default payload must not imply PTZ support."""
    capability = _normalize_ptz_capabilities({"onvif": {"host": "camera"}})

    assert capability.directional is False


def test_ptz_capability_accepts_runtime_pan_tilt_features() -> None:
    """Frigate's explicit runtime feature list is authoritative."""
    capability = _normalize_ptz_capabilities(
        {"features": ["pt", "focus"], "presets": ["Home"]}
    )

    assert capability.pan is True
    assert capability.tilt is True
    assert capability.focus is True
    assert capability.presets == ("Home",)
