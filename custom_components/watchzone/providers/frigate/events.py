"""Authenticated Frigate event queries and normalization."""

from __future__ import annotations

import hashlib
import json
from typing import Any
from urllib.parse import quote

from aiohttp import ClientError, ClientTimeout
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from yarl import URL

from ..events import EventItem, EventQuery, EventsProvider
from ..media import PlaybackSource
from .source import async_resolve_source

_REQUEST_TIMEOUT = ClientTimeout(total=15)


class FrigateEventsProvider:
    """Fetch mutable Frigate events without the integration event cache."""

    async def async_list_events(
        self, hass: HomeAssistant, entity_id: str, query: EventQuery
    ) -> list[EventItem]:
        source = await async_resolve_source(hass, entity_id)
        headers = await source.client.get_auth_headers()
        if query.bypass_cache:
            headers = {**headers, "Cache-Control": "no-cache"}
        try:
            async with async_get_clientsession(hass).get(
                URL(source.base_url) / "api/events",
                params={
                    "after": query.after,
                    "before": query.before,
                    "cameras": source.camera_name,
                    "limit": query.limit,
                },
                headers=headers,
                ssl=source.client.validate_ssl,
                timeout=_REQUEST_TIMEOUT,
            ) as response:
                response.raise_for_status()
                payload = await response.json()
        except (ClientError, TimeoutError, ValueError) as err:
            raise HomeAssistantError("Unable to retrieve camera events") from err
        if not isinstance(payload, list):
            raise HomeAssistantError("Frigate returned invalid event data")
        return [
            item
            for raw in payload
            if isinstance(raw, dict)
            and (item := _normalize_event(raw, source.frigate_instance_id)) is not None
        ]


def _normalize_event(raw: dict[str, Any], instance_id: str) -> EventItem | None:
    event_id = _text(raw.get("id"))
    camera = _text(raw.get("camera"))
    label = _text(raw.get("label"))
    start_time = _number(raw.get("start_time"))
    if not event_id or not camera or not label or start_time is None:
        return None
    end_time = _number(raw.get("end_time"))
    has_snapshot = raw.get("has_snapshot") is True
    has_clip = raw.get("has_clip") is True
    sub_label = _sub_label(raw.get("sub_label"))
    zones = _string_list(raw.get("zones"))
    material = {
        "camera": camera,
        "end_time": end_time,
        "has_clip": has_clip,
        "has_snapshot": has_snapshot,
        "label": label,
        "start_time": start_time,
        "sub_label": sub_label,
        "zones": zones,
    }
    revision = hashlib.sha256(
        json.dumps(material, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()[:16]
    base = (
        f"/api/frigate/{quote(instance_id, safe='')}/notifications/"
        f"{quote(event_id, safe='')}"
    )
    suffix = f"?v={revision}"
    clip_url = f"{base}/clip.mp4{suffix}" if has_clip else None
    hls_url = f"{base}/master.m3u8{suffix}" if has_clip else None
    return EventItem(
        id=f"{instance_id}:{event_id}",
        camera=camera,
        label=label,
        sub_label=sub_label,
        start_time=start_time,
        end_time=end_time,
        has_snapshot=has_snapshot,
        has_clip=has_clip,
        thumbnail_url=f"{base}/thumbnail.jpg{suffix}" if has_snapshot else None,
        snapshot_url=f"{base}/snapshot.jpg{suffix}" if has_snapshot else None,
        clip_url=clip_url,
        playback_sources=tuple(
            source
            for source in (
                PlaybackSource(clip_url, "video/mp4", "file") if clip_url else None,
                PlaybackSource(hls_url, "application/vnd.apple.mpegurl", "hls")
                if hls_url
                else None,
            )
            if source is not None
        ),
        preferred_transport="hls",
        zones=zones,
        revision=revision,
    )


def _text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _sub_label(value: object) -> str | None:
    if isinstance(value, list):
        return _text(value[0]) if value else None
    return _text(value)


def _string_list(value: object) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(dict.fromkeys(text for item in value if (text := _text(item))))


events: EventsProvider = FrigateEventsProvider()
