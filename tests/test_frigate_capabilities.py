"""Tests for explicit Frigate compatibility capability evidence."""

from custom_components.watchzone.providers.frigate.capabilities import (
    _has_audio_backchannel,
    _normalize_ptz_capabilities,
    _stream_metadata_requests,
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


def test_talk_capability_accepts_nested_and_explicit_provider_evidence() -> None:
    """Current and legacy integrations may wrap or normalize talk metadata."""
    assert (
        _has_audio_backchannel(
            {
                "front": {
                    "producers": [
                        {"medias": ["audio, sendrecv, PCMA/8000"]}
                    ]
                }
            }
        )
        is True
    )
    assert _has_audio_backchannel({"features": ["pt", "talk"]}) is True
    assert (
        _has_audio_backchannel(
            {"profile": {"supports_two_way_audio": True}}
        )
        is True
    )


def test_talk_capability_rejects_unrelated_camera_metadata() -> None:
    """Names and ordinary receive audio cannot create a false capability."""
    assert (
        _has_audio_backchannel(
            {
                "name": "microphone",
                "producers": [{"medias": ["audio, recvonly, AAC"]}],
                "features": ["pt", "zoom"],
            }
        )
        is False
    )


def test_talk_capability_supports_current_and_legacy_frigate_routes() -> None:
    """Frigate 0.18 and older expose go2rtc metadata at different paths."""
    requests = _stream_metadata_requests("http://frigate:5000", "front")

    assert str(requests[0][0]) == "http://frigate:5000/api/go2rtc/streams/front"
    assert "src" not in requests[0][1]
    assert str(requests[1][0]) == "http://frigate:5000/api/go2rtc/api/streams"
    assert requests[1][1]["src"] == "front"


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
