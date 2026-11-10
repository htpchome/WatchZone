"""Authenticated WebSocket boundary for provider-resolved recordings."""

from __future__ import annotations

from dataclasses import asdict
from datetime import date
from time import time
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import voluptuous as vol
from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components.websocket_api import async_register_command
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.components.websocket_api.decorators import (
    async_response,
    websocket_command,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

from ..const import DOMAIN
from ..providers.recordings import RecordingQuery
from . import runtime_from_hass


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/recordings/list",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("selected_date"): cv.string,
        vol.Required("timezone"): cv.string,
        vol.Optional("after"): vol.Coerce(float),
        vol.Optional("before"): vol.Coerce(float),
    }
)
@async_response
async def ws_recordings_list(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return recording days and the selected day's hourly ranges."""
    entity_id = msg["entity_id"]
    if connection.user is None or not connection.user.permissions.check_entity(
        entity_id, POLICY_READ
    ):
        connection.send_error(
            msg["id"], "recordings_forbidden", "Camera access is not permitted"
        )
        return
    try:
        date.fromisoformat(msg["selected_date"])
        ZoneInfo(msg["timezone"])
    except (ValueError, ZoneInfoNotFoundError):
        connection.send_error(
            msg["id"], "recordings_invalid_query", "Invalid recording date or timezone"
        )
        return
    before = msg.get("before", time())
    after = msg.get("after", before - 5 * 24 * 60 * 60)
    try:
        window = await runtime_from_hass(hass).recordings.async_list(
            entity_id,
            RecordingQuery(
                after=after,
                before=before,
                selected_date=msg["selected_date"],
                timezone=msg["timezone"],
            ),
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "recordings_list_failed", str(err))
        return
    connection.send_result(msg["id"], asdict(window))


@callback
def async_register(hass: HomeAssistant) -> None:
    async_register_command(hass, ws_recordings_list)
