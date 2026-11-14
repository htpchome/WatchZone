"""Authenticated Frigate review queries."""

from __future__ import annotations

import asyncio
import hashlib
import json
from collections import OrderedDict
from collections.abc import Mapping
from datetime import datetime
from time import monotonic
from typing import Any
from urllib.parse import quote

from aiohttp import ClientError, ClientTimeout
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from yarl import URL

from ..media import PlaybackSource
from ..reviews import (
    ReviewItem,
    ReviewQuery,
    ReviewsProvider,
    ReviewTrackedObject,
    ReviewTrackingDetails,
    ReviewTrackingEvent,
    ReviewTrackingEventKind,
)
from .source import FrigateSource, async_resolve_source

_REQUEST_TIMEOUT = ClientTimeout(total=15)
_CONFIG_CACHE_TTL_SECONDS = 300
_CONFIG_CACHE_MAX_ENTRIES = 16
_EVENT_ID_BATCH_SIZE = 50
_EVENT_LOOKUP_CONCURRENCY = 4
_TRACKING_TIMELINE_LIMIT = 500
_DEFAULT_CAPTURE_SECONDS = 5

_TRACKING_EVENT_KINDS: dict[str, ReviewTrackingEventKind] = {
    "visible": "detected",
    "entered_zone": "entered_zone",
    "active": "became_active",
    "stationary": "became_stationary",
    "gone": "left",
}


class FrigateReviewsProvider:
    """Fetch mutable Frigate reviews without the integration review cache."""

    def __init__(self) -> None:
        self._config_cache: OrderedDict[str, tuple[float, Mapping[str, Any]]] = (
            OrderedDict()
        )

    async def async_list_reviews(
        self, hass: HomeAssistant, entity_id: str, query: ReviewQuery
    ) -> list[ReviewItem]:
        source = await async_resolve_source(hass, entity_id)
        headers = await source.client.get_auth_headers()
        if query.bypass_cache:
            headers = {**headers, "Cache-Control": "no-cache"}
        try:
            alerts_payload, detections_payload = await asyncio.gather(
                _get_json(
                    hass,
                    source,
                    "api/review",
                    {
                        "after": query.after,
                        "before": query.before,
                        "cameras": source.camera_name,
                        "limit": query.limit,
                        "severity": "alert",
                    },
                    headers,
                ),
                _get_json(
                    hass,
                    source,
                    "api/review",
                    {
                        "after": query.after,
                        "before": query.before,
                        "cameras": source.camera_name,
                        "limit": query.limit,
                        "severity": "detection",
                    },
                    headers,
                ),
            )
        except (ClientError, TimeoutError, ValueError) as err:
            raise HomeAssistantError("Unable to retrieve camera reviews") from err
        if not isinstance(alerts_payload, list) or not isinstance(
            detections_payload, list
        ):
            raise HomeAssistantError("Frigate returned invalid review data")

        raw_reviews = _merge_review_payloads(alerts_payload, detections_payload)
        if query.enrich:
            config, related_events = await asyncio.gather(
                self._async_config(hass, source, headers, query.bypass_cache),
                _async_related_events(
                    hass,
                    source,
                    headers,
                    tuple(
                        dict.fromkeys(
                            event_id
                            for raw in raw_reviews
                            for event_id in _review_event_ids(raw)
                        )
                    ),
                ),
            )
        else:
            config = {}
            related_events = {}
        reviews = [
            item
            for raw in raw_reviews
            if (
                item := _normalize_review(
                    raw,
                    source,
                    query.before,
                    related_events,
                    config,
                )
            )
            is not None
        ]
        return sorted(reviews, key=lambda item: item.start_time, reverse=True)[
            : query.limit
        ]

    async def async_set_reviewed(
        self,
        hass: HomeAssistant,
        entity_id: str,
        review_id: str,
        reviewed: bool,
    ) -> None:
        """Set one Frigate review's reviewed state."""
        source = await async_resolve_source(hass, entity_id)
        prefix = f"{source.frigate_instance_id}:"
        if not review_id.startswith(prefix) or not review_id.removeprefix(prefix):
            raise HomeAssistantError("Review does not belong to this camera provider")
        headers = await source.client.get_auth_headers()
        try:
            await _post_json(
                hass,
                source,
                "api/reviews/viewed",
                {
                    "ids": [review_id.removeprefix(prefix)],
                    "reviewed": reviewed,
                },
                headers,
            )
        except (ClientError, TimeoutError, ValueError) as err:
            raise HomeAssistantError("Unable to update the review") from err

    async def async_get_tracking_details(
        self, hass: HomeAssistant, entity_id: str, review_id: str
    ) -> ReviewTrackingDetails:
        """Fetch and normalize the tracked-object lifecycle for one review."""
        source = await async_resolve_source(hass, entity_id)
        native_review_id = _native_id(review_id, source.frigate_instance_id)
        headers = await source.client.get_auth_headers()
        try:
            review_payload = await _get_json(
                hass,
                source,
                f"api/review/{quote(native_review_id, safe='')}",
                {},
                headers,
            )
        except (ClientError, TimeoutError, ValueError) as err:
            raise HomeAssistantError(
                "Unable to retrieve review tracking details"
            ) from err
        if not isinstance(review_payload, Mapping):
            raise HomeAssistantError("Frigate returned invalid review tracking data")
        if _text(review_payload.get("camera")) != source.camera_name:
            raise HomeAssistantError("Review does not belong to this camera")

        event_ids = _review_event_ids(review_payload)
        if not event_ids:
            return ReviewTrackingDetails(review_id, ())
        config, events, timeline_payload = await asyncio.gather(
            self._async_config(hass, source, headers, False),
            _async_related_events(hass, source, headers, event_ids),
            _async_tracking_timeline(hass, source, headers, event_ids),
        )
        timeline = (
            tuple(item for item in timeline_payload if isinstance(item, Mapping))
            if isinstance(timeline_payload, list)
            else ()
        )
        dimensions = _detect_dimensions(config, source.camera_name)
        objects = tuple(
            tracked
            for event_id in event_ids
            if (event := events.get(event_id)) is not None
            and (
                tracked := _normalize_tracked_object(
                    event_id,
                    event,
                    timeline,
                    dimensions,
                    source.camera_name,
                    source.frigate_instance_id,
                )
            )
            is not None
        )
        return ReviewTrackingDetails(review_id, objects)

    async def _async_config(
        self,
        hass: HomeAssistant,
        source: FrigateSource,
        headers: dict[str, str],
        bypass_cache: bool,
    ) -> Mapping[str, Any]:
        key = f"{source.base_url}:{source.frigate_instance_id}"
        cached = self._config_cache.get(key)
        if (
            not bypass_cache
            and cached is not None
            and monotonic() - cached[0] < _CONFIG_CACHE_TTL_SECONDS
        ):
            self._config_cache.move_to_end(key)
            return cached[1]

        try:
            payload = await _get_json(hass, source, "api/config", {}, headers)
        except ClientError, TimeoutError, ValueError:
            return cached[1] if cached is not None else {}
        if not isinstance(payload, Mapping):
            return cached[1] if cached is not None else {}

        self._config_cache[key] = (monotonic(), payload)
        self._config_cache.move_to_end(key)
        while len(self._config_cache) > _CONFIG_CACHE_MAX_ENTRIES:
            self._config_cache.popitem(last=False)
        return payload


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


async def _post_json(
    hass: HomeAssistant,
    source: FrigateSource,
    path: str,
    payload: Mapping[str, object],
    headers: dict[str, str],
) -> object:
    async with async_get_clientsession(hass).post(
        URL(source.base_url) / path,
        json=payload,
        headers=headers,
        ssl=source.client.validate_ssl,
        timeout=_REQUEST_TIMEOUT,
    ) as response:
        response.raise_for_status()
        return await response.json()


def _merge_review_payloads(*payloads: list[object]) -> list[dict[str, Any]]:
    reviews: dict[str, dict[str, Any]] = {}
    unidentified: list[dict[str, Any]] = []
    for payload in payloads:
        for raw in payload:
            if not isinstance(raw, dict):
                continue
            review_id = _text(raw.get("id"))
            if review_id is None:
                unidentified.append(raw)
                continue
            reviews[review_id] = raw
    return [*reviews.values(), *unidentified]


def _normalize_review(
    raw: dict[str, Any],
    source: FrigateSource,
    now: float,
    related_events: Mapping[str, Mapping[str, Any]] | None = None,
    config: Mapping[str, Any] | None = None,
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
    reviewed = raw.get("has_been_reviewed") is True
    raw_data = raw.get("data")
    data: dict[str, Any] = raw_data if isinstance(raw_data, dict) else {}
    metadata = _mapping(data.get("metadata"))
    analysis_title = _text(metadata.get("title"))
    analysis_description = _text(metadata.get("scene"))
    analysis_score = _confidence(metadata.get("confidence"))
    analysis_concerns = _unique_strings(_list(metadata.get("other_concerns")))
    event_ids = _review_event_ids(raw)
    events = related_events or {}
    event_payloads = [events[event_id] for event_id in event_ids if event_id in events]
    labels = _unique_strings(
        [
            *_list(data.get("objects")),
            *_list(data.get("audio")),
            *(event.get("label") for event in event_payloads),
        ]
    )
    sub_labels = _unique_strings(
        [
            *_list(data.get("sub_labels")),
            *(_sub_label(event.get("sub_label")) for event in event_payloads),
        ]
    )
    zones = _unique_strings(
        [
            *_list(data.get("zones")),
            *(zone for event in event_payloads for zone in _list(event.get("zones"))),
        ]
    )
    pre_capture, post_capture = _capture_window(config or {}, camera, classification)
    media_start = max(0, start_time - pre_capture)
    media_end = (end_time + post_capture) if end_time is not None else now
    material = {
        "analysis_description": analysis_description,
        "analysis_concerns": analysis_concerns,
        "analysis_score": analysis_score,
        "analysis_title": analysis_title,
        "classification": classification,
        "end_time": end_time,
        "labels": labels,
        # Wall-clock growth is presentation state, not a review revision.
        # Keeping it out of an active review's revision prevents every
        # reconciliation pass from replacing the same thumbnail URL.
        "media_end_time": media_end if end_time is not None else None,
        "media_start_time": media_start,
        "related_event_ids": event_ids,
        "reviewed": reviewed,
        "start_time": start_time,
        "sub_labels": sub_labels,
        "zones": zones,
    }
    revision = _revision(material)
    media_revision = revision if end_time is not None else "active"
    encoded_instance = quote(source.frigate_instance_id, safe="")
    encoded_review = quote(review_id, safe="")
    encoded_camera = quote(camera, safe="")
    snapshot_event_id = next(
        (
            event_id
            for event_id in event_ids
            if events.get(event_id, {}).get("has_snapshot") is True
        ),
        None,
    )
    recording_url = _recording_url(source, camera, media_start, media_end)
    vod_base = _vod_url(source, camera, media_start, media_end)
    return ReviewItem(
        id=f"{source.frigate_instance_id}:{review_id}",
        camera=camera,
        classification=classification,
        labels=labels,
        sub_labels=sub_labels,
        start_time=start_time,
        end_time=end_time,
        media_start_time=media_start,
        media_end_time=media_end,
        related_event_ids=tuple(
            f"{source.frigate_instance_id}:{event_id}" for event_id in event_ids
        ),
        reviewed=reviewed,
        analysis_title=analysis_title,
        analysis_description=analysis_description,
        analysis_score=analysis_score,
        analysis_concerns=analysis_concerns,
        preview_url=(
            f"/api/frigate/{encoded_instance}/notifications/{encoded_review}/"
            "review_preview.gif"
        ),
        thumbnail_url=(
            f"/api/frigate/{encoded_instance}/notifications/{encoded_review}/"
            f"{encoded_camera}/review_thumbnail.webp?v={media_revision}"
        ),
        snapshot_url=(
            f"/api/frigate/{encoded_instance}/notifications/"
            f"{quote(snapshot_event_id, safe='')}/snapshot.jpg?v={media_revision}"
            if snapshot_event_id
            else None
        ),
        clip_url=recording_url,
        download_url=f"{recording_url}?download=true",
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


async def _async_related_events(
    hass: HomeAssistant,
    source: FrigateSource,
    headers: dict[str, str],
    event_ids: tuple[str, ...],
) -> dict[str, Mapping[str, Any]]:
    if not event_ids:
        return {}
    semaphore = asyncio.Semaphore(_EVENT_LOOKUP_CONCURRENCY)

    async def fetch(batch: tuple[str, ...]) -> object:
        async with semaphore:
            try:
                return await _get_json(
                    hass,
                    source,
                    "api/event_ids",
                    {"ids": ",".join(batch)},
                    headers,
                )
            except ClientError, TimeoutError, ValueError:
                return []

    batches = tuple(
        event_ids[index : index + _EVENT_ID_BATCH_SIZE]
        for index in range(0, len(event_ids), _EVENT_ID_BATCH_SIZE)
    )
    payloads = await asyncio.gather(*(fetch(batch) for batch in batches))
    return {
        event_id: event
        for payload in payloads
        if isinstance(payload, list)
        for event in payload
        if isinstance(event, Mapping)
        and (event_id := _text(event.get("id"))) is not None
    }


async def _async_tracking_timeline(
    hass: HomeAssistant,
    source: FrigateSource,
    headers: dict[str, str],
    event_ids: tuple[str, ...],
) -> object:
    try:
        return await _get_json(
            hass,
            source,
            "api/timeline",
            {
                "source_id": ",".join(event_ids),
                "limit": _TRACKING_TIMELINE_LIMIT,
            },
            headers,
        )
    except (ClientError, TimeoutError, ValueError):
        return []


def _normalize_tracked_object(
    event_id: str,
    event: Mapping[str, Any],
    timeline: tuple[Mapping[str, Any], ...],
    dimensions: tuple[int, int] | None,
    camera: str,
    instance_id: str,
) -> ReviewTrackedObject | None:
    label = _text(event.get("label"))
    start_time = _timestamp(event.get("start_time"))
    if label is None or start_time is None:
        return None
    end_time = _timestamp(event.get("end_time"))
    lifecycle = [
        normalized
        for row in timeline
        if _text(row.get("source_id")) == event_id
        and _text(row.get("camera")) == camera
        and _text(row.get("source")) in (None, "tracked_object")
        and (normalized := _normalize_tracking_event(row, dimensions)) is not None
    ]
    if not any(item.kind == "detected" for item in lifecycle):
        lifecycle.append(
            _tracking_event("detected", start_time, event, dimensions)
        )
    if end_time is not None and not any(item.kind == "left" for item in lifecycle):
        lifecycle.append(_tracking_event("left", end_time, event, dimensions))
    lifecycle.sort(key=lambda item: item.timestamp)
    return ReviewTrackedObject(
        id=f"{instance_id}:{event_id}",
        label=label,
        sub_label=_text(_sub_label(event.get("sub_label"))),
        start_time=start_time,
        end_time=end_time,
        events=tuple(lifecycle),
    )


def _normalize_tracking_event(
    row: Mapping[str, Any], dimensions: tuple[int, int] | None
) -> ReviewTrackingEvent | None:
    kind = _TRACKING_EVENT_KINDS.get(_text(row.get("class_type")) or "")
    timestamp = _timestamp(row.get("timestamp"))
    if kind is None or timestamp is None:
        return None
    return _tracking_event(kind, timestamp, _mapping(row.get("data")), dimensions)


def _tracking_event(
    kind: ReviewTrackingEventKind,
    timestamp: float,
    data: Mapping[str, Any],
    dimensions: tuple[int, int] | None,
) -> ReviewTrackingEvent:
    box = _box(data.get("box"))
    box_area = box[2] * box[3] if box is not None else None
    ratio = _number(data.get("ratio"))
    if ratio is None and box is not None and box[3] > 0:
        ratio = box[2] / box[3]
    area_value = _number(data.get("area"))
    if area_value is None and box_area is not None and dimensions is not None:
        area_value = box_area * dimensions[0] * dimensions[1]
    return ReviewTrackingEvent(
        kind=kind,
        timestamp=timestamp,
        score=_confidence(data.get("score")),
        ratio=ratio,
        area=round(area_value) if area_value is not None else None,
        area_percentage=box_area * 100 if box_area is not None else None,
        zones=_string_list(data.get("zones")),
    )


def _detect_dimensions(
    config: Mapping[str, Any], camera: str
) -> tuple[int, int] | None:
    camera_config = _mapping(_mapping(config.get("cameras")).get(camera))
    detect = _mapping(camera_config.get("detect"))
    width = _number(detect.get("width"))
    height = _number(detect.get("height"))
    if width is None or height is None or width <= 0 or height <= 0:
        return None
    return round(width), round(height)


def _box(value: object) -> tuple[float, float, float, float] | None:
    if not isinstance(value, list) or len(value) != 4:
        return None
    values = tuple(_number(part) for part in value)
    if any(part is None for part in values):
        return None
    return values  # type: ignore[return-value]


def _native_id(value: str, instance_id: str) -> str:
    prefix = f"{instance_id}:"
    if not value.startswith(prefix) or not value.removeprefix(prefix):
        raise HomeAssistantError("Review does not belong to this camera provider")
    return value.removeprefix(prefix)


def _review_event_ids(raw: Mapping[str, Any]) -> tuple[str, ...]:
    data = raw.get("data")
    if not isinstance(data, Mapping):
        return ()
    return _unique_strings(_list(data.get("detections")))


def _capture_window(
    config: Mapping[str, Any], camera: str, classification: str
) -> tuple[int, int]:
    global_record = _mapping(config.get("record"))
    cameras = _mapping(config.get("cameras"))
    camera_record = _mapping(_mapping(cameras.get(camera)).get("record"))
    category_name = f"{classification}s"
    global_category = _mapping(global_record.get(category_name))
    camera_category = _mapping(camera_record.get(category_name))
    return (
        _capture_seconds(
            camera_category.get("pre_capture"),
            global_category.get("pre_capture"),
        ),
        _capture_seconds(
            camera_category.get("post_capture"),
            global_category.get("post_capture"),
        ),
    )


def _mapping(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _capture_seconds(value: object, fallback: object) -> int:
    for candidate in (value, fallback, _DEFAULT_CAPTURE_SECONDS):
        if (
            not isinstance(candidate, bool)
            and isinstance(candidate, int | float)
            and candidate >= 0
        ):
            return int(candidate)
    return _DEFAULT_CAPTURE_SECONDS


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


def _confidence(value: object) -> float | None:
    confidence = _number(value)
    if confidence is None or confidence < 0:
        return None
    if confidence > 1:
        confidence /= 100
    return min(confidence, 1)


def _text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _string_list(value: object) -> tuple[str, ...]:
    return _unique_strings(_list(value))


def _list(value: object) -> list[object]:
    return value if isinstance(value, list) else []


def _unique_strings(values: list[object]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(text for value in values if (text := _text(value))))


def _sub_label(value: object) -> object:
    if isinstance(value, list):
        return value[0] if value else None
    return value


reviews: ReviewsProvider = FrigateReviewsProvider()
