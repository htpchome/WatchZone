"""Tests for normalized Frigate event data."""

from types import SimpleNamespace
from typing import Any, cast

import pytest

from custom_components.camera_optics.providers.frigate.events import (
    FrigateEventsProvider,
    _normalize_event,
)
from custom_components.camera_optics.providers.frigate.source import FrigateSource


async def test_event_provider_gets_one_native_id_without_listing_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Direct lookup validates camera ownership and returns normalized media."""

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
    requests: list[str] = []

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
        del hass, resolved_source, params, headers
        requests.append(path)
        return {
            "camera": "front",
            "has_clip": True,
            "has_snapshot": True,
            "id": "event-1",
            "label": "person",
            "start_time": 100,
        }

    monkeypatch.setattr(
        "custom_components.camera_optics.providers.frigate.events.async_resolve_source",
        resolve_source,
    )
    monkeypatch.setattr(
        "custom_components.camera_optics.providers.frigate.events._get_json", get_json
    )

    item = await FrigateEventsProvider().async_get_event(
        cast(Any, SimpleNamespace()), "camera.front", "event-1"
    )

    assert item is not None
    assert item.id == "frigate_workshop:event-1"
    assert requests == ["api/events/event-1"]


def test_event_revision_changes_with_mutable_media_and_end_time() -> None:
    """Same-ID updates produce a new cache key and normalized media URLs."""
    pending = _normalize_event(
        {
            "id": "1700000000.1-abc",
            "camera": "front",
            "label": "person",
            "top_score": 0.94,
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
    assert complete.score == 0.94
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
