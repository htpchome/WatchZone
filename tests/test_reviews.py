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
