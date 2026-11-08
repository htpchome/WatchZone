"""Authenticated Frigate review and motion queries."""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import quote

from aiohttp import ClientError, ClientTimeout
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from yarl import URL

from ..reviews import ReviewItem, ReviewQuery, ReviewsProvider
from .source import FrigateSource, async_resolve_source

_REQUEST_TIMEOUT = ClientTimeout(total=15)
_MIN_MOTION_SCALE_SECONDS = 30
_MAX_MOTION_POINTS = 1_000


@dataclass(frozen=True, slots=True)
class _MotionSample:
    start_time: float
    motion: float


class FrigateReviewsProvider:
    """Fetch mutable Frigate reviews without the integration review cache."""

    async def async_list_reviews(
        self, hass: HomeAssistant, entity_id: str, query: ReviewQuery
    ) -> list[ReviewItem]:
        source = await async_resolve_source(hass, entity_id)
        headers = await source.client.get_auth_headers()
        if query.bypass_cache:
            headers = {**headers, "Cache-Control": "no-cache"}
        scale = max(
            _MIN_MOTION_SCALE_SECONDS,
            math.ceil((query.before - query.after) / _MAX_MOTION_POINTS),
        )
        reviews_result, motion_result = await asyncio.gather(
            _get_json(
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
            ),
            _get_json(
                hass,
                source,
                "api/review/activity/motion",
                {
                    "after": query.after,
                    "before": query.before,
                    "cameras": source.camera_name,
                    "scale": scale,
                },
                headers,
            ),
            return_exceptions=True,
        )
        if isinstance(reviews_result, asyncio.CancelledError):
            raise reviews_result
        if isinstance(reviews_result, (ClientError, TimeoutError, ValueError)):
            raise HomeAssistantError(
                "Unable to retrieve camera alerts"
            ) from reviews_result
        if isinstance(reviews_result, BaseException):
            raise reviews_result
        if isinstance(motion_result, asyncio.CancelledError):
            raise motion_result
        reviews_payload = reviews_result
        motion_payload = (
            [] if isinstance(motion_result, BaseException) else motion_result
        )
        if not isinstance(reviews_payload, list) or not isinstance(
            motion_payload, list
        ):
            raise HomeAssistantError("Frigate returned invalid alert data")

        reviews = [
            item
            for raw in reviews_payload
            if isinstance(raw, dict)
            and (
                item := _normalize_review(raw, source, query.before)
            )
            is not None
        ]
        samples = [
            sample
            for raw in motion_payload
            if isinstance(raw, dict)
            and (sample := _normalize_motion_sample(raw, source.camera_name))
            is not None
        ]
        motion = _motion_items(samples, reviews, source, scale)
        return sorted(
            [*reviews, *motion], key=lambda item: item.start_time, reverse=True
        )[: query.limit]


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
    labels = _unique_strings(
        [*_list(data.get("objects")), *_list(data.get("audio"))]
    )
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
        clip_url=_recording_url(source, camera, start_time, media_end),
        zones=zones,
        revision=revision,
    )


def _normalize_motion_sample(
    raw: dict[str, Any], camera_name: str
) -> _MotionSample | None:
    camera = _text(raw.get("camera"))
    start_time = _timestamp(raw.get("start_time"))
    motion = _number(raw.get("motion"))
    if camera != camera_name or start_time is None or motion is None or motion <= 0:
        return None
    return _MotionSample(start_time, motion)


def _motion_items(
    samples: list[_MotionSample],
    reviews: list[ReviewItem],
    source: FrigateSource,
    scale: int,
) -> list[ReviewItem]:
    review_windows = [
        (item.start_time, item.end_time or item.start_time + scale)
        for item in reviews
    ]
    standalone = sorted(
        (
            sample
            for sample in samples
            if not any(
                start <= sample.start_time < end for start, end in review_windows
            )
        ),
        key=lambda sample: sample.start_time,
    )
    groups: list[tuple[float, float]] = []
    for sample in standalone:
        sample_end = sample.start_time + scale
        if groups and sample.start_time <= groups[-1][1] + scale * 0.5:
            groups[-1] = (groups[-1][0], sample_end)
        else:
            groups.append((sample.start_time, sample_end))

    items: list[ReviewItem] = []
    for start_time, end_time in groups:
        material = {
            "classification": "motion",
            "end_time": end_time,
            "start_time": start_time,
        }
        revision = _revision(material)
        items.append(
            ReviewItem(
                id=(
                    f"{source.frigate_instance_id}:motion:"
                    f"{start_time:.3f}:{end_time:.3f}"
                ),
                camera=source.camera_name,
                classification="motion",
                labels=(),
                sub_labels=(),
                start_time=start_time,
                end_time=end_time,
                thumbnail_url=None,
                snapshot_url=None,
                clip_url=_recording_url(
                    source, source.camera_name, start_time, end_time
                ),
                zones=(),
                revision=revision,
            )
        )
    return items


def _recording_url(
    source: FrigateSource, camera: str, start_time: float, end_time: float
) -> str:
    return (
        f"/api/frigate/{quote(source.frigate_instance_id, safe='')}/recording/"
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
