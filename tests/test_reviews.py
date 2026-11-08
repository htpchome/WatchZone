"""Tests for normalized Frigate review activity."""

from types import SimpleNamespace
from typing import cast

from custom_components.watchzone.providers.frigate.reviews import (
    _motion_items,
    _MotionSample,
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
                "objects": ["person", "car", "person"],
                "sub_labels": ["Resident"],
                "zones": ["driveway", "driveway"],
                "audio": ["speech"],
            },
        },
        _source(),
        1_700_000_030,
    )

    assert item is not None
    assert item.classification == "alert"
    assert item.labels == ("person", "car", "speech")
    assert item.sub_labels == ("Resident",)
    assert item.zones == ("driveway",)
    assert item.thumbnail_url is not None
    assert item.thumbnail_url.startswith(
        "/api/frigate/frigate_workshop/notifications/1700000000.1-abc/"
        "front/review_thumbnail.webp"
    )
    assert item.clip_url is not None
    assert "/recording/front/start/1700000000.1/end/1700000024.2" in item.clip_url


def test_motion_activity_is_grouped_and_excludes_review_windows() -> None:
    """Bounded motion samples form standalone periods without duplicate reviews."""
    review = _normalize_review(
        {
            "id": "review",
            "camera": "front",
            "start_time": 100,
            "end_time": 150,
            "severity": "detection",
            "data": {},
        },
        _source(),
        200,
    )
    assert review is not None

    items = _motion_items(
        [
            _MotionSample(10, 2),
            _MotionSample(40, 3),
            _MotionSample(110, 4),
            _MotionSample(180, 5),
        ],
        [review],
        _source(),
        30,
    )

    assert [(item.start_time, item.end_time) for item in items] == [
        (10, 70),
        (180, 210),
    ]
    assert all(item.classification == "motion" for item in items)
    assert all(item.thumbnail_url is None for item in items)
