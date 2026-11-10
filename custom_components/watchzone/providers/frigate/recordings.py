"""Authenticated Frigate recording availability and range normalization."""

from __future__ import annotations

import asyncio
import hashlib
import json
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime, timedelta
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
    RecordingQuery,
    RecordingsProvider,
    RecordingWindow,
)
from .source import FrigateSource, async_resolve_source

_REQUEST_TIMEOUT = ClientTimeout(total=15)


class FrigateRecordingsProvider:
    """Fetch Frigate recording summaries and bounded segment metadata."""

    async def async_list_recordings(
        self, hass: HomeAssistant, entity_id: str, query: RecordingQuery
    ) -> RecordingWindow:
        source = await async_resolve_source(hass, entity_id)
        headers = await source.client.get_auth_headers()
        summary, segments = await _fetch_recordings(hass, source, headers, query)
        days = _recording_days(summary, query.timezone)
        return RecordingWindow(
            days=days,
            hours=_recording_hours(source, segments, query),
        )


async def _fetch_recordings(
    hass: HomeAssistant,
    source: FrigateSource,
    headers: dict[str, str],
    query: RecordingQuery,
) -> tuple[object, object]:
    day_start, day_end = _day_bounds(query.selected_date, query.timezone)
    session = async_get_clientsession(hass)
    try:
        summary, segments = await asyncio.gather(
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
        )
    except (ClientError, TimeoutError, ValueError) as err:
        raise HomeAssistantError("Unable to retrieve camera recordings") from err
    return summary, segments


async def _get_json(
    session: Any,
    url: URL,
    params: dict[str, str | float],
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
    source: FrigateSource, payload: object, query: RecordingQuery
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
        grouped[hour].append((start, end))
    hours = [
        _normalize_hour(source, hour, segments)
        for hour, segments in grouped.items()
    ]
    return tuple(sorted(hours, key=lambda item: item.start_time, reverse=True))


def _normalize_hour(
    source: FrigateSource,
    hour: datetime,
    segments: list[tuple[float, float]],
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
    material = {
        "camera": source.camera_name,
        "duration": round(duration, 3),
        "end": round(end_time, 3),
        "start": round(start_time, 3),
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
        playback_sources=(
            PlaybackSource(file_url, "video/mp4", "file"),
            PlaybackSource(hls_url, "application/vnd.apple.mpegurl", "hls"),
        ),
        preferred_transport="hls",
        download_url=file_url,
        revision=revision,
    )


def _day_bounds(value: str, timezone: str) -> tuple[float, float]:
    start = datetime.fromisoformat(value).replace(tzinfo=ZoneInfo(timezone))
    return start.timestamp(), (start + timedelta(days=1)).timestamp()


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _timestamp_path(value: float) -> str:
    return f"{value:.3f}".rstrip("0").rstrip(".")


recordings: RecordingsProvider = FrigateRecordingsProvider()
