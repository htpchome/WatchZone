"""Tests for normalized Frigate event data."""

from custom_components.watchzone.providers.frigate.events import _normalize_event


def test_event_revision_changes_with_mutable_media_and_end_time() -> None:
    """Same-ID updates produce a new cache key and normalized media URLs."""
    pending = _normalize_event(
        {
            "id": "1700000000.1-abc",
            "camera": "front",
            "label": "person",
            "start_time": 1700000000.1,
            "end_time": None,
            "has_snapshot": False,
            "has_clip": False,
        },
        "frigate_workshop",
    )
    complete = _normalize_event(
        {
            "id": "1700000000.1-abc",
            "camera": "front",
            "label": "person",
            "sub_label": ["Resident", 0.91],
            "start_time": 1700000000.1,
            "end_time": 1700000024.2,
            "has_snapshot": True,
            "has_clip": True,
            "zones": ["driveway", "front_yard", "driveway", ""],
        },
        "frigate_workshop",
    )

    assert pending is not None
    assert complete is not None
    assert pending.id == complete.id == "frigate_workshop:1700000000.1-abc"
    assert pending.revision != complete.revision
    assert complete.sub_label == "Resident"
    assert complete.zones == ("driveway", "front_yard")
    assert complete.thumbnail_url is not None
    assert complete.thumbnail_url.startswith(
        "/api/frigate/frigate_workshop/notifications/1700000000.1-abc/"
    )
    assert f"v={complete.revision}" in complete.thumbnail_url
    assert complete.preferred_transport == "hls"
    assert [source.transport for source in complete.playback_sources] == [
        "file",
        "hls",
    ]
    assert complete.playback_sources[0].url == complete.clip_url
    assert complete.playback_sources[1].url.endswith(
        f"master.m3u8?v={complete.revision}"
    )


def test_invalid_event_is_not_exposed() -> None:
    """Provider payloads without stable presentation identity are discarded."""
    assert _normalize_event({"id": "incomplete"}, "frigate") is None
