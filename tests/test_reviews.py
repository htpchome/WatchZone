"""Tests for normalized Frigate review activity."""

from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock

import pytest

from custom_components.watchzone.providers.frigate.reviews import (
    FrigateReviewsProvider,
    _capture_window,
    _normalize_review,
)
from custom_components.watchzone.providers.frigate.source import FrigateSource
from custom_components.watchzone.providers.reviews import ReviewQuery


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
            "has_been_reviewed": True,
            "severity": "alert",
            "thumb_path": "/media/frigate/clips/review/thumb-front.webp",
            "data": {
                "detections": ["event-bird", "event-goldfinch"],
                "metadata": {
                    "confidence": 0.98,
                    "other_concerns": ["Gate left open", "Gate left open"],
                    "title": "Resident entering garage",
                    "scene": "A resident walks toward the parked car.",
                },
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
    assert item.reviewed is True
    assert item.analysis_title == "Resident entering garage"
    assert item.analysis_description == (
        "A resident walks toward the parked car."
    )
    assert item.analysis_score == 0.98
    assert item.analysis_concerns == ("Gate left open",)
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
    assert item.preview_url == (
        "/api/frigate/frigate_workshop/notifications/1700000000.1-abc/"
        "review_preview.gif"
    )
    assert item.clip_url is not None
    assert "/recording/front/start/1699999993.1/end/1700000029.2" in item.clip_url
    assert item.download_url == f"{item.clip_url}?download=true"
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


def test_review_normalization_omits_incomplete_analysis() -> None:
    """Malformed or partial provider metadata does not create analysis UI."""
    item = _normalize_review(
        {
            "camera": "front",
            "data": {"metadata": {"title": "  ", "scene": 42}},
            "id": "review-without-analysis",
            "severity": "detection",
            "start_time": 100,
        },
        _source(),
        110,
    )

    assert item is not None
    assert item.analysis_title is None
    assert item.analysis_description is None
    assert item.analysis_score is None
    assert item.analysis_concerns == ()


def test_active_review_keeps_stable_thumbnail_identity() -> None:
    """Elapsed wall time must not churn an active review's thumbnail URL."""
    payload = {
        "camera": "front",
        "data": {"detections": ["event-person"], "objects": ["person"]},
        "id": "active-review",
        "severity": "alert",
        "start_time": 100,
    }
    events = {
        "event-person": {
            "has_snapshot": True,
            "id": "event-person",
            "label": "person",
        }
    }

    first = _normalize_review(payload, _source(), 110, events)
    later = _normalize_review(payload, _source(), 125, events)

    assert first is not None
    assert later is not None
    assert first.revision == later.revision
    assert first.thumbnail_url == later.thumbnail_url
    assert first.thumbnail_url is not None
    assert first.thumbnail_url.endswith("review_thumbnail.webp?v=active")
    assert first.snapshot_url == later.snapshot_url
    assert first.media_end_time != later.media_end_time

    complete = _normalize_review(
        {**payload, "end_time": 120},
        _source(),
        125,
        events,
    )
    assert complete is not None
    assert complete.thumbnail_url != first.thumbnail_url
    assert not complete.thumbnail_url.endswith("?v=active")


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


async def test_review_provider_filters_motion_before_frigate_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Separate severity queries prevent motion reviews from consuming the page."""

    async def get_auth_headers() -> dict[str, str]:
        return {"Authorization": "Bearer token"}

    source = cast(
        FrigateSource,
        SimpleNamespace(
            base_url="http://frigate.local",
            camera_name="front",
            client=SimpleNamespace(
                get_auth_headers=get_auth_headers,
                validate_ssl=True,
            ),
            frigate_instance_id="frigate_workshop",
        ),
    )
    requests: list[dict[str, str | int | float]] = []

    async def resolve_source(hass: Any, entity_id: str) -> FrigateSource:
        del hass, entity_id
        return source

    async def get_json(
        hass: Any,
        resolved_source: FrigateSource,
        path: str,
        params: dict[str, str | int | float],
        headers: dict[str, str],
    ) -> object:
        del hass, resolved_source, headers
        assert path == "api/review"
        requests.append(params)
        severity = cast(str, params["severity"])
        return [
            {
                "camera": "front",
                "data": {},
                "end_time": 101 if severity == "alert" else 91,
                "id": f"review-{severity}",
                "severity": severity,
                "start_time": 100 if severity == "alert" else 90,
            }
        ]

    async def config(
        hass: Any,
        resolved_source: FrigateSource,
        headers: dict[str, str],
        bypass_cache: bool,
    ) -> dict[str, object]:
        del hass, resolved_source, headers, bypass_cache
        return {}

    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.reviews.async_resolve_source",
        resolve_source,
    )
    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.reviews._get_json",
        get_json,
    )
    provider = FrigateReviewsProvider()
    monkeypatch.setattr(provider, "_async_config", config)

    items = await provider.async_list_reviews(
        cast(Any, SimpleNamespace()),
        "camera.front",
        ReviewQuery(after=0, before=200, limit=500),
    )

    assert [item.classification for item in items] == ["alert", "detection"]
    assert {request["severity"] for request in requests} == {
        "alert",
        "detection",
    }
    assert all(request["limit"] == 500 for request in requests)


async def test_review_summary_skips_related_event_and_config_enrichment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The first-paint query returns without waiting for enrichment requests."""

    async def get_auth_headers() -> dict[str, str]:
        return {}

    source = cast(
        FrigateSource,
        SimpleNamespace(
            base_url="http://frigate.local",
            camera_name="front",
            client=SimpleNamespace(
                get_auth_headers=get_auth_headers,
                validate_ssl=True,
            ),
            frigate_instance_id="frigate_workshop",
        ),
    )

    async def resolve_source(hass: Any, entity_id: str) -> FrigateSource:
        del hass, entity_id
        return source

    async def get_json(
        hass: Any,
        resolved_source: FrigateSource,
        path: str,
        params: dict[str, str | int | float],
        headers: dict[str, str],
    ) -> object:
        del hass, resolved_source, headers
        assert path == "api/review"
        if params["severity"] == "detection":
            return []
        return [
            {
                "camera": "front",
                "data": {"detections": ["event-person"], "objects": ["person"]},
                "end_time": 101,
                "id": "review-alert",
                "severity": "alert",
                "start_time": 100,
            }
        ]

    config = AsyncMock()
    related_events = AsyncMock()
    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.reviews.async_resolve_source",
        resolve_source,
    )
    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.reviews._get_json",
        get_json,
    )
    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.reviews._async_related_events",
        related_events,
    )
    provider = FrigateReviewsProvider()
    monkeypatch.setattr(provider, "_async_config", config)

    items = await provider.async_list_reviews(
        cast(Any, SimpleNamespace()),
        "camera.front",
        ReviewQuery(after=0, before=200, limit=10, enrich=False),
    )

    assert [item.labels for item in items] == [("person",)]
    config.assert_not_awaited()
    related_events.assert_not_awaited()


async def test_review_provider_sets_reviewed_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A normalized review ID is translated into Frigate's mutation payload."""

    async def get_auth_headers() -> dict[str, str]:
        return {"Authorization": "Bearer token"}

    source = cast(
        FrigateSource,
        SimpleNamespace(
            base_url="http://frigate.local",
            camera_name="front",
            client=SimpleNamespace(
                get_auth_headers=get_auth_headers,
                validate_ssl=True,
            ),
            frigate_instance_id="frigate_workshop",
        ),
    )
    hass = cast(Any, SimpleNamespace())
    post_json = AsyncMock(return_value={"success": True})

    async def resolve_source(
        resolved_hass: Any, entity_id: str
    ) -> FrigateSource:
        del resolved_hass, entity_id
        return source

    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.reviews.async_resolve_source",
        resolve_source,
    )
    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.reviews._post_json",
        post_json,
    )

    await FrigateReviewsProvider().async_set_reviewed(
        hass,
        "camera.front",
        "frigate_workshop:review-1",
        True,
    )

    post_json.assert_awaited_once_with(
        hass,
        source,
        "api/reviews/viewed",
        {"ids": ["review-1"], "reviewed": True},
        {"Authorization": "Bearer token"},
    )


async def test_review_tracking_details_normalize_timeline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Tracking details validate review ownership and normalize lifecycle data."""

    async def get_auth_headers() -> dict[str, str]:
        return {"Authorization": "Bearer token"}

    source = cast(
        FrigateSource,
        SimpleNamespace(
            base_url="http://frigate.local",
            camera_name="front",
            client=SimpleNamespace(
                get_auth_headers=get_auth_headers,
                validate_ssl=True,
            ),
            frigate_instance_id="frigate_workshop",
        ),
    )

    async def resolve_source(hass: Any, entity_id: str) -> FrigateSource:
        del hass, entity_id
        return source

    async def get_json(
        hass: Any,
        resolved_source: FrigateSource,
        path: str,
        params: dict[str, str | int | float],
        headers: dict[str, str],
    ) -> object:
        del hass, resolved_source, headers
        if path == "api/review/review-1":
            return {
                "camera": "front",
                "data": {"detections": ["event-1"]},
                "id": "review-1",
            }
        if path == "api/event_ids":
            assert params == {"ids": "event-1"}
            return [
                {
                    "end_time": 108,
                    "id": "event-1",
                    "label": "person",
                    "start_time": 100,
                    "sub_label": ["Resident", 0.96],
                }
            ]
        if path == "api/timeline":
            assert params == {"source_id": "event-1", "limit": 500}
            return [
                {
                    "camera": "front",
                    "class_type": "visible",
                    "data": {
                        "box": [0.1, 0.2, 0.25, 0.5],
                        "ratio": 0.5,
                        "score": 0.73,
                    },
                    "source": "tracked_object",
                    "source_id": "event-1",
                    "timestamp": 100,
                },
                {
                    "camera": "front",
                    "class_type": "entered_zone",
                    "data": {
                        "box": [0.2, 0.2, 0.3, 0.5],
                        "score": 0.86,
                        "zones": ["garage"],
                    },
                    "source": "tracked_object",
                    "source_id": "event-1",
                    "timestamp": 103,
                },
                {
                    "camera": "other",
                    "class_type": "gone",
                    "data": {},
                    "source": "tracked_object",
                    "source_id": "event-1",
                    "timestamp": 104,
                },
            ]
        if path == "api/config":
            return {
                "cameras": {"front": {"detect": {"height": 1080, "width": 1920}}}
            }
        raise AssertionError(f"Unexpected request: {path}")

    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.reviews.async_resolve_source",
        resolve_source,
    )
    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.reviews._get_json",
        get_json,
    )

    details = await FrigateReviewsProvider().async_get_tracking_details(
        cast(Any, SimpleNamespace()),
        "camera.front",
        "frigate_workshop:review-1",
    )

    assert details.review_id == "frigate_workshop:review-1"
    assert len(details.objects) == 1
    tracked = details.objects[0]
    assert tracked.label == "person"
    assert tracked.sub_label == "Resident"
    assert [event.kind for event in tracked.events] == [
        "detected",
        "entered_zone",
        "left",
    ]
    assert tracked.events[0].score == 0.73
    assert tracked.events[0].ratio == 0.5
    assert tracked.events[0].area == 259_200
    assert tracked.events[0].area_percentage == 12.5
    assert tracked.events[1].zones == ("garage",)
