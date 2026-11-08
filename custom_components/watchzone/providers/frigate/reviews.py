"""Authenticated Frigate review queries."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from datetime import datetime
from typing import Any
from urllib.parse import quote

from aiohttp import ClientError, ClientTimeout
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from yarl import URL

from ..media import PlaybackSource
from ..reviews import ReviewItem, ReviewQuery, ReviewsProvider
from .source import FrigateSource, async_resolve_source

_REQUEST_TIMEOUT = ClientTimeout(total=15)


class FrigateReviewsProvider:
    """Fetch mutable Frigate reviews without the integration review cache."""

    async def async_list_reviews(
        self, hass: HomeAssistant, entity_id: str, query: ReviewQuery
    ) -> list[ReviewItem]:
        source = await async_resolve_source(hass, entity_id)
        headers = await source.client.get_auth_headers()
        if query.bypass_cache:
            headers = {**headers, "Cache-Control": "no-cache"}
        try:
            reviews_payload = await _get_json(
                hass,
                source,
                "api/review",
                {
                    "after": query.after,
                    "before": query.before,
                    "cameras": source.camera_name,
                    "limit": query.limit,
                },
                headers,
            )
        except (ClientError, TimeoutError, ValueError) as err:
            raise HomeAssistantError("Unable to retrieve camera alerts") from err
        if not isinstance(reviews_payload, list):
            raise HomeAssistantError("Frigate returned invalid alert data")

        reviews = [
            item
            for raw in reviews_payload
            if isinstance(raw, dict)
            and (item := _normalize_review(raw, source, query.before)) is not None
        ]
        return sorted(reviews, key=lambda item: item.start_time, reverse=True)[
            : query.limit
        ]


async def _get_json(
    hass: HomeAssistant,
    source: FrigateSource,
    path: str,
    params: Mapping[str, str | int | float],
    headers: dict[str, str],
) -> object:
    async with async_get_clientsession(hass).get(
        URL(source.base_url) / path,
        params=params,
        headers=headers,
        ssl=source.client.validate_ssl,
        timeout=_REQUEST_TIMEOUT,
    ) as response:
        response.raise_for_status()
        return await response.json()


def _normalize_review(
    raw: dict[str, Any], source: FrigateSource, now: float
) -> ReviewItem | None:
    review_id = _text(raw.get("id"))
    camera = _text(raw.get("camera"))
    classification = raw.get("severity")
    start_time = _timestamp(raw.get("start_time"))
    if (
        not review_id
        or not camera
        or classification not in ("alert", "detection")
        or start_time is None
    ):
        return None
    end_time = _timestamp(raw.get("end_time"))
    raw_data = raw.get("data")
    data: dict[str, Any] = raw_data if isinstance(raw_data, dict) else {}
    labels = _unique_strings([*_list(data.get("objects")), *_list(data.get("audio"))])
    sub_labels = _string_list(data.get("sub_labels"))
    zones = _string_list(data.get("zones"))
    material = {
        "classification": classification,
        "end_time": end_time,
        "labels": labels,
        "start_time": start_time,
        "sub_labels": sub_labels,
        "zones": zones,
    }
    revision = _revision(material)
    encoded_instance = quote(source.frigate_instance_id, safe="")
    encoded_review = quote(review_id, safe="")
    encoded_camera = quote(camera, safe="")
    media_end = end_time or now
    recording_url = _recording_url(source, camera, start_time, media_end)
    vod_base = _vod_url(source, camera, start_time, media_end)
    return ReviewItem(
        id=f"{source.frigate_instance_id}:{review_id}",
        camera=camera,
        classification=classification,
        labels=labels,
        sub_labels=sub_labels,
        start_time=start_time,
        end_time=end_time,
        thumbnail_url=(
            f"/api/frigate/{encoded_instance}/notifications/{encoded_review}/"
            f"{encoded_camera}/review_thumbnail.webp?v={revision}"
        ),
        snapshot_url=None,
        clip_url=recording_url,
        playback_sources=(
            PlaybackSource(
                f"{vod_base}/index.m3u8",
                "application/vnd.apple.mpegurl",
                "hls",
            ),
            PlaybackSource(
                f"{vod_base}/master.m3u8",
                "application/vnd.apple.mpegurl",
                "hls",
            ),
            PlaybackSource(recording_url, "video/mp4", "file"),
        ),
        preferred_transport="hls",
        zones=zones,
        revision=revision,
    )


def _recording_url(
    source: FrigateSource, camera: str, start_time: float, end_time: float
) -> str:
    return (
        f"/api/frigate/{quote(source.frigate_instance_id, safe='')}/recording/"
        f"{quote(camera, safe='')}/start/{start_time}/end/{end_time}"
    )


def _vod_url(
    source: FrigateSource, camera: str, start_time: float, end_time: float
) -> str:
    return (
        f"/api/frigate/{quote(source.frigate_instance_id, safe='')}/vod/"
        f"{quote(camera, safe='')}/start/{start_time}/end/{end_time}"
    )


def _revision(material: object) -> str:
    return hashlib.sha256(
        json.dumps(material, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()[:16]


def _timestamp(value: object) -> float | None:
    number = _number(value)
    if number is not None:
        return number
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _string_list(value: object) -> tuple[str, ...]:
    return _unique_strings(_list(value))


def _list(value: object) -> list[object]:
    return value if isinstance(value, list) else []


def _unique_strings(values: list[object]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(text for value in values if (text := _text(value))))


reviews: ReviewsProvider = FrigateReviewsProvider()
