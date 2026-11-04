"""Tests for Home Assistant two-way-audio capability resolution."""

from types import SimpleNamespace

from custom_components.watchzone.features.talk import _resolve_talk_capability


def test_talk_capability_requires_home_assistant_two_way_audio() -> None:
    """Generic WebRTC support alone must not advertise a camera backchannel."""
    capabilities = SimpleNamespace(frontend_stream_types={"web_rtc"})

    capability = _resolve_talk_capability(capabilities)

    assert capability.supported is False
    assert capability.probe_required is True


def test_talk_capability_uses_home_assistant_resolved_signal() -> None:
    """The HA camera capability is the sole positive capability signal."""
    capabilities = SimpleNamespace(
        frontend_stream_types={"web_rtc"}, two_way_audio=True
    )

    capability = _resolve_talk_capability(capabilities)

    assert capability.supported is True
    assert capability.probe_required is False


def test_talk_capability_rejects_non_webrtc_camera() -> None:
    """A legacy fallback probe is offered only for HA WebRTC cameras."""
    capability = _resolve_talk_capability(
        SimpleNamespace(frontend_stream_types={"hls"})
    )

    assert capability.supported is False
    assert capability.probe_required is False
