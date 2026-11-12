"""Authenticated WebSocket boundary for system information."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components.websocket_api import async_register_command
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.components.websocket_api.decorators import (
    async_response,
    websocket_command,
)
from homeassistant.core import HomeAssistant

from ..const import DOMAIN
from ..features.system_info import system_info_dict
from . import runtime_from_hass


@websocket_command({vol.Required("type"): f"{DOMAIN}/system_info"})
@async_response
async def ws_system_info(
    hass: HomeAssistant,
    connection: ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return sanitized version and provider-installation information."""
    info = await runtime_from_hass(hass).system_info.async_snapshot()
    connection.send_result(msg["id"], system_info_dict(info))


def async_register(hass: HomeAssistant) -> None:
    """Register the system-information WebSocket command."""
    async_register_command(hass, ws_system_info)
