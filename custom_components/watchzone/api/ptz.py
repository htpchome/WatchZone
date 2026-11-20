"""Authenticated WebSocket boundary for provider-resolved PTZ."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol
from homeassistant.auth.permissions.const import POLICY_CONTROL, POLICY_READ
from homeassistant.components.websocket_api import async_register_command
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.components.websocket_api.decorators import (
    async_response,
    websocket_command,
)
from homeassistant.core import Context, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

from ..const import DOMAIN
from . import runtime_from_hass

_LOGGER = logging.getLogger(__name__)
_DIRECTIONS = ("down", "left", "right", "up")


def _require_permission(
    connection: ActiveConnection, entity_id: str, policy: str
) -> None:
    if connection.user is None or not connection.user.permissions.check_entity(
        entity_id, policy
    ):
        raise HomeAssistantError("Camera access is not permitted")


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ptz/capability",
        vol.Required("provider"): cv.string,
        vol.Required("entity_id"): cv.entity_id,
    }
)
@async_response
async def ws_ptz_capability(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return normalized PTZ capabilities for one HA camera."""
    try:
        _require_permission(connection, msg["entity_id"], POLICY_READ)
        capability = await runtime_from_hass(hass).ptz.async_capabilities(
            msg["provider"], msg["entity_id"]
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "ptz_capability_failed", str(err))
        return
    connection.send_result(
        msg["id"],
        {
            "supported": capability.directional,
            "pan": capability.pan,
            "tilt": capability.tilt,
            "zoom": capability.zoom,
            "focus": capability.focus,
            "presets": capability.presets,
        },
    )


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ptz/move",
        vol.Required("provider"): cv.string,
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("direction"): vol.In(_DIRECTIONS),
    }
)
@async_response
async def ws_ptz_move(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Keep one movement alive for the lifetime of this subscription."""
    try:
        _require_permission(connection, msg["entity_id"], POLICY_CONTROL)
        user = connection.user
        if user is None:
            raise HomeAssistantError("Authentication required")
        service = runtime_from_hass(hass).ptz
        motion = await service.async_start(
            msg["provider"],
            msg["entity_id"],
            msg["direction"],
            Context(user_id=user.id),
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "ptz_move_failed", str(err))
        return
    except Exception:
        _LOGGER.exception("Unable to start PTZ for %s", msg["entity_id"])
        connection.send_error(msg["id"], "ptz_move_failed", "PTZ movement failed")
        return

    @callback
    def stop() -> None:
        async def async_stop_safely() -> None:
            try:
                await service.async_stop(motion)
            except Exception:
                _LOGGER.exception("Unable to stop PTZ for %s", motion.entity_id)

        hass.async_create_task(
            async_stop_safely(),
            f"{DOMAIN} stop PTZ for {motion.entity_id}",
        )

    connection.subscriptions[msg["id"]] = stop
    connection.send_result(msg["id"])


@callback
def async_register(hass: HomeAssistant) -> None:
    async_register_command(hass, ws_ptz_capability)
    async_register_command(hass, ws_ptz_move)
