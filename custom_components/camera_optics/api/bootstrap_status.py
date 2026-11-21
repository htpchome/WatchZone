"""Authenticated WebSocket boundary for integration readiness."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components.websocket_api import async_register_command
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.components.websocket_api.decorators import websocket_command
from homeassistant.core import HomeAssistant

from ..const import DOMAIN
from ..features.bootstrap_status import bootstrap_status, bootstrap_status_dict


@websocket_command({vol.Required("type"): f"{DOMAIN}/bootstrap/status"})
def ws_bootstrap_status(
    hass: HomeAssistant,
    connection: ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return readiness without requiring a configured runtime."""
    connection.send_result(msg["id"], bootstrap_status_dict(bootstrap_status(hass)))


def async_register(hass: HomeAssistant) -> None:
    """Register the readiness command before config-entry setup."""
    async_register_command(hass, ws_bootstrap_status)
