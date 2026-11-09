"""Authenticated WebSocket activity update source resolution."""

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
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

from ..const import DOMAIN
from . import runtime_from_hass


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/activity/source",
        vol.Required("entity_id"): cv.entity_id,
    }
)
@async_response
async def ws_activity_source(
    hass: HomeAssistant,
    connection: ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Resolve an authorized provider activity subscription source."""
    entity_id = msg["entity_id"]
    if connection.user is None or not connection.user.permissions.check_entity(
        entity_id, POLICY_READ
    ):
        connection.send_error(
            msg["id"], "activity_forbidden", "Camera access is not permitted"
        )
        return
    try:
        source = await runtime_from_hass(hass).activity_updates.async_source(entity_id)
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "activity_source_failed", str(err))
        return
    connection.send_result(msg["id"], asdict(source))


def async_register(hass: HomeAssistant) -> None:
    """Register activity update WebSocket commands."""
    async_register_command(hass, ws_activity_source)
