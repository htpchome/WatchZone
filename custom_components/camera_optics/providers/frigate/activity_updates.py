"""Frigate real-time activity subscription and normalization."""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from time import time
from typing import Any
from urllib.parse import quote

from homeassistant.components import mqtt
from homeassistant.components.mqtt.models import ReceiveMessage
from homeassistant.core import HomeAssistant

from ..activity_updates import (
    ActivityUpdateCallback,
    ActivityUpdateKind,
    ActivityUpdateNotification,
    ActivityUpdatePhase,
    ActivityUpdatesProvider,
    ActivityUpdateUnsubscribe,
)
from ..reviews import ReviewClassification, ReviewItem
from .source import FrigateActivityIdentity, async_resolve_activity_identity


class FrigateActivityUpdatesProvider:
    """Subscribe to Frigate MQTT and publish normalized CameraOptics updates."""

    async def async_subscribe_activity_updates(
        self,
        hass: HomeAssistant,
        entity_id: str,
        kind: ActivityUpdateKind,
        callback: ActivityUpdateCallback,
    ) -> ActivityUpdateUnsubscribe:
        source = await async_resolve_activity_identity(hass, entity_id)

        def receive(message: ReceiveMessage) -> None:
            notification = _normalize_payload(message.payload, source, kind)
            if notification is not None:
                callback(notification)

        return await mqtt.async_subscribe(
            hass, f"{source.topic_prefix}/{kind}", receive, qos=0
        )


def _normalize_payload(
    value: object,
    source: FrigateActivityIdentity,
    kind: ActivityUpdateKind,
) -> ActivityUpdateNotification | None:
    payload = _parse_payload(value)
    if payload is None:
        return None
    after = payload.get("after")
    before = payload.get("before")
    activity = after if isinstance(after, Mapping) else before
    if (
        not isinstance(activity, Mapping)
        or activity.get("camera") != source.camera_name
    ):
        return None
    severity = activity.get("severity")
    classification: ReviewClassification | None = (
        severity if severity in ("alert", "detection") else None
    )
    if kind == "reviews" and classification is None:
        return None
    end_time = activity.get("end_time")
    raw_phase = payload.get("type")
    phase: ActivityUpdatePhase | None
    if _number(end_time) is not None:
        phase = "end"
    elif raw_phase in ("end", "new", "update"):
        phase = raw_phase
    else:
        phase = None
    review = (
        _normalize_review(payload, source, classification, phase)
        if kind == "reviews"
        else None
    )
    raw_id = activity.get("id")
    return ActivityUpdateNotification(
        camera_name=source.camera_name,
        topic=kind,
        classification=classification,
        id=raw_id if isinstance(raw_id, str) else None,
        phase=phase,
        review=review,
    )


def _normalize_review(
    payload: Mapping[str, Any],
    source: FrigateActivityIdentity,
    classification: ReviewClassification | None,
    phase: ActivityUpdatePhase | None,
) -> ReviewItem | None:
    after = payload.get("after")
    before = payload.get("before")
    activity = after if isinstance(after, Mapping) else before
    if not isinstance(activity, Mapping):
        return None
    review_id = activity.get("id")
    camera = activity.get("camera")
    start_time = _number(activity.get("start_time"))
    if (
        not isinstance(review_id, str)
        or not isinstance(camera, str)
        or classification is None
        or start_time is None
    ):
        return None
    data = activity.get("data")
    data = data if isinstance(data, Mapping) else {}
    labels = _strings((*_sequence(data.get("objects")), *_sequence(data.get("audio"))))
    sub_labels = _strings(_sequence(data.get("sub_labels")))
    zones = _strings(_sequence(data.get("zones")))
    event_ids = _strings(_sequence(data.get("detections")))
    metadata = data.get("metadata")
    metadata = metadata if isinstance(metadata, Mapping) else {}
    analysis_title = _text(metadata.get("title"))
    analysis_description = _text(metadata.get("scene"))
    analysis_score = _confidence(metadata.get("confidence"))
    analysis_concerns = _strings(_sequence(metadata.get("other_concerns")))
    end_time = _number(activity.get("end_time"))
    media_end_time = end_time if end_time is not None else time()
    revision = ":".join(
        (
            "push",
            phase or "change",
            classification,
            str(end_time) if end_time is not None else "draft",
            ",".join(labels),
            ",".join(sub_labels),
            ",".join(zones),
            ",".join(event_ids),
            analysis_title or "",
            analysis_description or "",
            str(analysis_score) if analysis_score is not None else "",
            ",".join(analysis_concerns),
        )
    )
    instance = quote(source.frigate_instance_id, safe="")
    encoded_review = quote(review_id, safe="")
    encoded_camera = quote(camera, safe="")
    return ReviewItem(
        analysis_description=analysis_description,
        analysis_concerns=analysis_concerns,
        analysis_score=analysis_score,
        analysis_title=analysis_title,
        camera=camera,
        classification=classification,
        clip_url=None,
        download_url=None,
        end_time=end_time,
        id=f"{source.frigate_instance_id}:{review_id}",
        labels=labels,
        media_end_time=media_end_time,
        media_start_time=start_time,
        playback_sources=(),
        preferred_transport="file",
        preview_url=(
            f"/api/frigate/{instance}/notifications/{encoded_review}/review_preview.gif"
        ),
        related_event_ids=tuple(
            f"{source.frigate_instance_id}:{event_id}" for event_id in event_ids
        ),
        reviewed=activity.get("has_been_reviewed") is True,
        revision=revision,
        score=None,
        snapshot_url=None,
        start_time=start_time,
        sub_labels=sub_labels,
        thumbnail_url=(
            f"/api/frigate/{instance}/notifications/{encoded_review}/"
            f"{encoded_camera}/review_thumbnail.webp?v={quote(revision, safe='')}"
        ),
        zones=zones,
    )


def _parse_payload(value: object) -> Mapping[str, Any] | None:
    if isinstance(value, Mapping):
        return value
    if isinstance(value, bytes):
        try:
            value = value.decode()
        except UnicodeDecodeError:
            return None
    if not isinstance(value, str):
        return None
    try:
        parsed = json.loads(value)
    except TypeError, ValueError:
        return None
    return parsed if isinstance(parsed, Mapping) else None


def _sequence(value: object) -> Sequence[object]:
    return value if isinstance(value, Sequence) and not isinstance(value, str) else ()


def _strings(values: Sequence[object]) -> tuple[str, ...]:
    return tuple(
        dict.fromkeys(value for value in values if isinstance(value, str) and value)
    )


def _text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _number(value: object) -> float | None:
    return (
        float(value)
        if isinstance(value, int | float) and not isinstance(value, bool)
        else None
    )


def _confidence(value: object) -> float | None:
    number = _number(value)
    if number is None or number < 0:
        return None
    return min(number / 100 if number > 1 else number, 1)


activity_updates: ActivityUpdatesProvider = FrigateActivityUpdatesProvider()
