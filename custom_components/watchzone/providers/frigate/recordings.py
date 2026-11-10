"""Authenticated Frigate recording availability and range normalization."""

from __future__ import annotations

import asyncio
import hashlib
import json
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime, timedelta
from time import time
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo

from aiohttp import ClientError, ClientTimeout
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from yarl import URL

from ..media import PlaybackSource
from ..recordings import (
    RecordingHour,
    RecordingMarker,
    RecordingQuery,
    RecordingSpan,
    RecordingsProvider,
    RecordingWindow,
)
from .source import FrigateSource, async_resolve_source

_REQUEST_TIMEOUT = ClientTimeout(total=15)
_REVIEW_LIMIT = 1000


class FrigateRecordingsProvider:
    """Fetch Frigate recording summaries and bounded segment metadata."""

    async def async_list_recordings(
        self, hass: HomeAssistant, entity_id: str, query: RecordingQuery
    ) -> RecordingWindow:
        source = await async_resolve_source(hass, entity_id)
        headers = await source.client.get_auth_headers()
        summary, segments, reviews = await _fetch_recordings(
            hass, source, headers, query
        )
        days = _recording_days(summary, query.timezone)
        return RecordingWindow(
            days=days,
            hours=_recording_hours(source, segments, query, reviews),
        )


async def _fetch_recordings(
    hass: HomeAssistant,
    source: FrigateSource,
    headers: dict[str, str],
    query: RecordingQuery,
) -> tuple[object, object, object]:
    day_start, day_end = _day_bounds(query.selected_date, query.timezone)
    session = async_get_clientsession(hass)
    try:
        summary, segments, reviews = await asyncio.gather(
            _get_json(
                session,
                URL(source.base_url) / "api" / "recordings" / "summary",
                {
                    "cameras": source.camera_name,
                    "timezone": query.timezone,
                },
                source,
                headers,
            ),
            _get_json(
                session,
                URL(source.base_url) / "api" / source.camera_name / "recordings",
                {"after": day_start, "before": day_end},
                source,
                headers,
            ),
            _fetch_review_markers(
                session, source, headers, day_start, day_end
            ),
        )
    except (ClientError, TimeoutError, ValueError) as err:
        raise HomeAssistantError("Unable to retrieve camera recordings") from err
    return summary, segments, reviews


async def _fetch_review_markers(
    session: Any,
    source: FrigateSource,
    headers: dict[str, str],
    after: float,
    before: float,
) -> object:
    """Return bounded activity metadata without failing recording discovery."""
    try:
        payloads = await asyncio.gather(
            *(
                _get_json(
                    session,
                    URL(source.base_url) / "api" / "review",
                    {
                        "after": after,
                        "before": before,
                        "cameras": source.camera_name,
                        "limit": _REVIEW_LIMIT,
                        "severity": classification,
                    },
                    source,
                    headers,
                )
                for classification in ("alert", "detection")
            )
        )
    except (ClientError, TimeoutError, ValueError):
        return ()
    return [
        raw
        for payload in payloads
        if isinstance(payload, list)
        for raw in payload
    ]


async def _get_json(
    session: Any,
    url: URL,
    params: dict[str, str | int | float],
    source: FrigateSource,
    headers: dict[str, str],
) -> object:
    async with session.get(
        url,
        params=params,
        headers=headers,
        ssl=source.client.validate_ssl,
        timeout=_REQUEST_TIMEOUT,
    ) as response:
        response.raise_for_status()
        return await response.json()


def _recording_days(payload: object, timezone: str) -> tuple[str, ...]:
    raw_days: Iterable[object]
    if isinstance(payload, dict):
        raw_days = payload.keys()
    elif isinstance(payload, list):
        raw_days = (
            raw.get("day") for raw in payload if isinstance(raw, dict)
        )
    else:
        raise HomeAssistantError("Frigate returned invalid recording summary data")
    days: list[str] = []
    for day in raw_days:
        if not isinstance(day, str):
            continue
        try:
            _day_bounds(day, timezone)
        except ValueError:
            continue
        days.append(day)
    return tuple(sorted(set(days), reverse=True))


def _recording_hours(
    source: FrigateSource,
    payload: object,
    query: RecordingQuery,
    reviews: object = (),
) -> tuple[RecordingHour, ...]:
    if not isinstance(payload, list):
        raise HomeAssistantError("Frigate returned invalid recording segment data")
    zone = ZoneInfo(query.timezone)
    grouped: dict[datetime, list[tuple[float, float]]] = defaultdict(list)
    for raw in payload:
        if not isinstance(raw, dict):
            continue
        start = _number(raw.get("start_time"))
        end = _number(raw.get("end_time"))
        if start is None or end is None or end <= start:
            continue
        hour = datetime.fromtimestamp(start, zone).replace(
            minute=0, second=0, microsecond=0
        )
        while hour.timestamp() < end:
            grouped[hour].append((start, end))
            next_hour = hour + timedelta(hours=1)
            if next_hour.timestamp() <= hour.timestamp():
                break
            hour = next_hour
    hours = [
        _normalize_hour(source, hour, segments, reviews)
        for hour, segments in grouped.items()
    ]
    return tuple(sorted(hours, key=lambda item: item.start_time, reverse=True))


def _normalize_hour(
    source: FrigateSource,
    hour: datetime,
    segments: list[tuple[float, float]],
    reviews: object,
) -> RecordingHour:
    hour_start = hour.timestamp()
    hour_end = (hour + timedelta(hours=1)).timestamp()
    clipped = sorted(
        (max(start, hour_start), min(end, hour_end)) for start, end in segments
    )
    merged: list[tuple[float, float]] = []
    for start, end in clipped:
        if end <= start:
            continue
        if merged and start <= merged[-1][1]:
            previous_start, previous_end = merged[-1]
            merged[-1] = (previous_start, max(previous_end, end))
        else:
            merged.append((start, end))
    start_time = merged[0][0]
    end_time = merged[-1][1]
    duration = sum(end - start for start, end in merged)
    media_offset = 0.0
    spans: list[RecordingSpan] = []
    for start, end in merged:
        spans.append(
            RecordingSpan(
                start_time=start,
                end_time=end,
                media_offset=media_offset,
            )
        )
        media_offset += end - start
    markers = _recording_markers(source, reviews, hour_start, hour_end)
    material = {
        "camera": source.camera_name,
        "duration": round(duration, 3),
        "end": round(end_time, 3),
        "start": round(start_time, 3),
        "spans": [
            (round(span.start_time, 3), round(span.end_time, 3))
            for span in spans
        ],
    }
    revision = hashlib.sha256(
        json.dumps(material, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()[:16]
    instance = quote(source.frigate_instance_id, safe="")
    camera = quote(source.camera_name, safe="")
    path_start = _timestamp_path(start_time)
    path_end = _timestamp_path(end_time)
    file_url = (
        f"/api/frigate/{instance}/recording/{camera}/"
        f"start/{path_start}/end/{path_end}"
    )
    hls_url = (
        f"/api/frigate/{instance}/vod/{camera}/"
        f"start/{path_start}/end/{path_end}/"
        f"index.m3u8?v={revision}"
    )
    return RecordingHour(
        id=f"{source.frigate_instance_id}:{source.camera_name}:{path_start}",
        camera=source.camera_name,
        start_time=start_time,
        end_time=end_time,
        duration=duration,
        timeline_start_time=hour_start,
        timeline_end_time=hour_end,
        spans=tuple(spans),
        markers=markers,
        playback_sources=(
            PlaybackSource(file_url, "video/mp4", "file"),
            PlaybackSource(hls_url, "application/vnd.apple.mpegurl", "hls"),
        ),
        preferred_transport="hls",
        download_url=file_url,
        revision=revision,
    )


def _recording_markers(
    source: FrigateSource,
    payload: object,
    hour_start: float,
    hour_end: float,
) -> tuple[RecordingMarker, ...]:
    if not isinstance(payload, (list, tuple)):
        return ()
    markers: list[RecordingMarker] = []
    for raw in payload:
        if not isinstance(raw, dict):
            continue
        review_id = _text(raw.get("id"))
        classification = raw.get("severity")
        start = _number(raw.get("start_time"))
        if (
            not review_id
            or classification not in ("alert", "detection")
            or start is None
        ):
            continue
        raw_end = _number(raw.get("end_time"))
        end = raw_end if raw_end is not None else max(start + 1, time())
        if end <= hour_start or start >= hour_end:
            continue
        clipped_start = max(start, hour_start)
        clipped_end = min(max(end, clipped_start + 1), hour_end)
        material = {
            "classification": classification,
            "end": round(end, 3),
            "start": round(start, 3),
        }
        revision = hashlib.sha256(
            json.dumps(material, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()[:16]
        instance = quote(source.frigate_instance_id, safe="")
        encoded_review = quote(review_id, safe="")
        camera = quote(source.camera_name, safe="")
        markers.append(
            RecordingMarker(
                id=f"{source.frigate_instance_id}:{review_id}",
                classification=classification,
                start_time=clipped_start,
                end_time=clipped_end,
                thumbnail_url=(
                    f"/api/frigate/{instance}/notifications/{encoded_review}/"
                    f"{camera}/review_thumbnail.webp?v={revision}"
                ),
            )
        )
    return tuple(sorted(markers, key=lambda marker: marker.start_time))


def _day_bounds(value: str, timezone: str) -> tuple[float, float]:
    start = datetime.fromisoformat(value).replace(tzinfo=ZoneInfo(timezone))
    return start.timestamp(), (start + timedelta(days=1)).timestamp()


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _timestamp_path(value: float) -> str:
    return f"{value:.3f}".rstrip("0").rstrip(".")


recordings: RecordingsProvider = FrigateRecordingsProvider()
