"""Authenticated provider-neutral activity subscriptions."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

import voluptuous as vol
from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components.websocket_api import async_register_command
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.components.websocket_api.decorators import (
    async_response,
    websocket_command,
)
from homeassistant.components.websocket_api.messages import event_message
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

from ..const import DOMAIN
from ..providers.activity_updates import ActivityUpdateNotification
from . import runtime_from_hass


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/activity/subscribe",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("kind"): vol.In(("events", "reviews")),
    }
)
@async_response
async def ws_activity_subscribe(
    hass: HomeAssistant,
    connection: ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Subscribe to normalized activity for one authorized camera."""
    entity_id = msg["entity_id"]
    if connection.user is None or not connection.user.permissions.check_entity(
        entity_id, POLICY_READ
    ):
        connection.send_error(
            msg["id"], "activity_forbidden", "Camera access is not permitted"
        )
        return

    def send(notification: ActivityUpdateNotification) -> None:
        payload: dict[str, object] = {
            "cameraName": notification.camera_name,
            "topic": notification.topic,
        }
        if notification.classification is not None:
            payload["classification"] = notification.classification
        if notification.id is not None:
            payload["id"] = notification.id
        if notification.phase is not None:
            payload["phase"] = notification.phase
        if notification.review is not None:
            payload["review"] = asdict(notification.review)
        connection.send_message(event_message(msg["id"], payload))

    try:
        unsubscribe = await runtime_from_hass(hass).activity_updates.async_subscribe(
            entity_id, msg["kind"], send
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "activity_subscribe_failed", str(err))
        return
    connection.subscriptions[msg["id"]] = unsubscribe
    connection.send_result(msg["id"])


def async_register(hass: HomeAssistant) -> None:
    """Register activity update WebSocket commands."""
    async_register_command(hass, ws_activity_subscribe)
