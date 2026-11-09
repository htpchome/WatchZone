"""Tests for normalized Frigate review activity."""

from types import SimpleNamespace
from typing import cast

from custom_components.watchzone.providers.frigate.reviews import (
    _capture_window,
    _normalize_review,
)
from custom_components.watchzone.providers.frigate.source import FrigateSource


def _source() -> FrigateSource:
    return cast(
        FrigateSource,
        SimpleNamespace(
            camera_name="front",
            frigate_instance_id="frigate_workshop",
        ),
    )


def test_review_normalization_preserves_classification_and_media() -> None:
    """Review payloads become provider-neutral activity with stable media URLs."""
    item = _normalize_review(
        {
            "id": "1700000000.1-abc",
            "camera": "front",
            "start_time": 1_700_000_000.1,
            "end_time": 1_700_000_024.2,
            "severity": "alert",
            "thumb_path": "/media/frigate/clips/review/thumb-front.webp",
            "data": {
                "detections": ["event-bird", "event-goldfinch"],
                "objects": ["person", "car", "person"],
                "sub_labels": ["Resident"],
                "zones": ["driveway", "driveway"],
                "audio": ["speech"],
            },
        },
        _source(),
        1_700_000_030,
        {
            "event-bird": {
                "id": "event-bird",
                "label": "bird",
                "sub_label": "Northern Mockingbird",
                "zones": ["bird_feeder"],
                "has_snapshot": True,
            },
            "event-goldfinch": {
                "id": "event-goldfinch",
                "label": "bird",
                "sub_label": ["American Goldfinch", 0.96],
                "zones": ["bird_feeder", "back_yard"],
                "has_snapshot": True,
            },
        },
        {
            "record": {"alerts": {"pre_capture": 5, "post_capture": 5}},
            "cameras": {"front": {"record": {"alerts": {"pre_capture": 7}}}},
        },
    )

    assert item is not None
    assert item.classification == "alert"
    assert item.labels == ("person", "car", "speech", "bird")
    assert item.sub_labels == (
        "Resident",
        "Northern Mockingbird",
        "American Goldfinch",
    )
    assert item.zones == ("driveway", "bird_feeder", "back_yard")
    assert item.related_event_ids == (
        "frigate_workshop:event-bird",
        "frigate_workshop:event-goldfinch",
    )
    assert item.media_start_time == 1_699_999_993.1
    assert item.media_end_time == 1_700_000_029.2
    assert item.thumbnail_url is not None
    assert item.thumbnail_url.startswith(
        "/api/frigate/frigate_workshop/notifications/1700000000.1-abc/"
        "front/review_thumbnail.webp"
    )
    assert item.clip_url is not None
    assert "/recording/front/start/1699999993.1/end/1700000029.2" in item.clip_url
    assert item.snapshot_url is not None
    assert "/notifications/event-bird/snapshot.jpg" in item.snapshot_url
    assert item.preferred_transport == "hls"
    assert [source.transport for source in item.playback_sources] == [
        "hls",
        "hls",
        "file",
    ]
    assert "/vod/front/start/1699999993.1/end/1700000029.2/index.m3u8" in (
        item.playback_sources[0].url
    )
    assert item.playback_sources[-1].url == item.clip_url


def test_capture_window_uses_camera_override_then_global_defaults() -> None:
    """Effective category padding respects partial per-camera overrides."""
    config = {
        "record": {
            "alerts": {"pre_capture": 4, "post_capture": 6},
            "detections": {"pre_capture": 8, "post_capture": 10},
        },
        "cameras": {
            "front": {
                "record": {
                    "alerts": {"post_capture": 12},
                }
            }
        },
    }

    assert _capture_window(config, "front", "alert") == (4, 12)
    assert _capture_window(config, "front", "detection") == (8, 10)
    assert _capture_window({}, "front", "alert") == (5, 5)
