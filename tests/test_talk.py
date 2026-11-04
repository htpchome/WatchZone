"""Tests for native Home Assistant two-way-audio capability resolution."""

from types import SimpleNamespace

from custom_components.watchzone.providers.home_assistant.talk import (
    _resolve_native_talk_capability,
)


def test_talk_capability_requires_home_assistant_two_way_audio() -> None:
    """Generic WebRTC support alone must not advertise a camera backchannel."""
    capabilities = SimpleNamespace(frontend_stream_types={"web_rtc"})

    supported, has_webrtc = _resolve_native_talk_capability(capabilities)

    assert supported is False
    assert has_webrtc is True


def test_talk_capability_uses_home_assistant_resolved_signal() -> None:
    """The HA camera capability is the sole positive capability signal."""
    capabilities = SimpleNamespace(
        frontend_stream_types={"web_rtc"}, two_way_audio=True
    )

    supported, has_webrtc = _resolve_native_talk_capability(capabilities)

    assert supported is True
    assert has_webrtc is True


def test_talk_capability_rejects_non_webrtc_camera() -> None:
    """A legacy fallback probe is offered only for HA WebRTC cameras."""
    supported, has_webrtc = _resolve_native_talk_capability(
        SimpleNamespace(frontend_stream_types={"hls"})
    )

    assert supported is False
    assert has_webrtc is False
