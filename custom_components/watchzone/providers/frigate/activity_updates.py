"""Frigate MQTT activity update subscriptions."""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from typing import Any

from aiohttp import ClientError, ClientTimeout
from homeassistant.components.mqtt import async_subscribe
from homeassistant.components.mqtt.models import ReceiveMessage
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from yarl import URL

from ..activity_updates import (
    ActivityUpdateKind,
    ActivityUpdateListener,
    ActivityUpdatesProvider,
)
from .source import async_resolve_source

_REQUEST_TIMEOUT = ClientTimeout(total=15)


class FrigateActivityUpdatesProvider:
    """Translate Frigate MQTT messages into camera-scoped invalidations."""

    async def async_subscribe_activity_updates(
        self,
        hass: HomeAssistant,
        entity_id: str,
        kind: ActivityUpdateKind,
        listener: ActivityUpdateListener,
    ) -> Callable[[], None]:
        source = await async_resolve_source(hass, entity_id)
        headers = await source.client.get_auth_headers()
        try:
            async with async_get_clientsession(hass).get(
                URL(source.base_url) / "api/config",
                headers=headers,
                ssl=source.client.validate_ssl,
                timeout=_REQUEST_TIMEOUT,
            ) as response:
                response.raise_for_status()
                config = await response.json()
        except (ClientError, TimeoutError, ValueError) as err:
            raise HomeAssistantError(
                "Unable to subscribe to camera activity"
            ) from err
        topic_prefix = _topic_prefix(config)
        if topic_prefix is None:
            raise HomeAssistantError("Frigate MQTT topic is unavailable")

        def receive(message: ReceiveMessage) -> None:
            if _activity_payload_matches(message.payload, source.camera_name, kind):
                listener()

        return await async_subscribe(
            hass,
            f"{topic_prefix}/{'events' if kind == 'events' else 'reviews'}",
            receive,
        )


def _topic_prefix(config: object) -> str | None:
    if not isinstance(config, Mapping):
        return None
    mqtt = config.get("mqtt")
    if not isinstance(mqtt, Mapping):
        return None
    prefix = mqtt.get("topic_prefix")
    return prefix.strip() if isinstance(prefix, str) and prefix.strip() else None


def _activity_payload_matches(
    payload: str | bytes | bytearray,
    camera_name: str,
    kind: ActivityUpdateKind,
) -> bool:
    try:
        raw: Any = json.loads(payload)
    except (json.JSONDecodeError, TypeError, UnicodeDecodeError):
        return False
    if not isinstance(raw, Mapping):
        return False
    activity = raw.get("after") or raw.get("before")
    if not isinstance(activity, Mapping) or activity.get("camera") != camera_name:
        return False
    return kind == "events" or activity.get("severity") in ("alert", "detection")


activity_updates: ActivityUpdatesProvider = FrigateActivityUpdatesProvider()
