"""Authenticated WebSocket boundary for provider-resolved recordings."""

from __future__ import annotations

from dataclasses import asdict
from datetime import date
from math import isfinite
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
from ..providers.recordings import RecordingQuery, RecordingSegmentRequest
from . import runtime_from_hass


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/recordings/list",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("selected_date"): cv.string,
        vol.Required("timezone"): cv.string,
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
    try:
        window = await runtime_from_hass(hass).recordings.async_list(
            entity_id,
            RecordingQuery(
                selected_date=msg["selected_date"],
                timezone=msg["timezone"],
            ),
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "recordings_list_failed", str(err))
        return
    connection.send_result(msg["id"], asdict(window))


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/recordings/segment",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("start_time"): vol.Coerce(float),
        vol.Required("end_time"): vol.Coerce(float),
    }
)
@async_response
async def ws_recordings_segment(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Resolve one bounded recording segment for preview and download."""
    entity_id = msg["entity_id"]
    if connection.user is None or not connection.user.permissions.check_entity(
        entity_id, POLICY_READ
    ):
        connection.send_error(
            msg["id"], "recordings_forbidden", "Camera access is not permitted"
        )
        return
    start_time = msg["start_time"]
    end_time = msg["end_time"]
    duration = end_time - start_time
    if (
        not isfinite(start_time)
        or not isfinite(end_time)
        or start_time < 0
        or duration < 1
        or duration > 4200
    ):
        connection.send_error(
            msg["id"],
            "recordings_invalid_segment",
            "Recording segment must be between one second and 70 minutes",
        )
        return
    try:
        download = await runtime_from_hass(
            hass
        ).recordings.async_resolve_segment(
            entity_id,
            RecordingSegmentRequest(start_time=start_time, end_time=end_time),
        )
    except HomeAssistantError as err:
        connection.send_error(
            msg["id"], "recordings_segment_failed", str(err)
        )
        return
    connection.send_result(msg["id"], asdict(download))


@callback
def async_register(hass: HomeAssistant) -> None:
    async_register_command(hass, ws_recordings_list)
    async_register_command(hass, ws_recordings_segment)
