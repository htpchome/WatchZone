"""Authenticated WebSocket boundary for camera runtime capabilities."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

import voluptuous as vol
from homeassistant.auth.permissions.const import POLICY_CONTROL, POLICY_READ
from homeassistant.components.websocket_api import async_register_command
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.components.websocket_api.decorators import (
    async_response,
    websocket_command,
)
from homeassistant.components.websocket_api.messages import event_message
from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

from ..const import DOMAIN
from ..features.camera_runtime import snapshot_dict
from . import runtime_from_hass

_MAX_RESUME_SECONDS = 31 * 24 * 60 * 60
_LOGGER = logging.getLogger(__name__)


def _require_entity_permission(
    connection: ActiveConnection, entity_id: str, policy: str
) -> None:
    """Enforce the authenticated user's Home Assistant entity permission."""
    if connection.user is None or not connection.user.permissions.check_entity(
        entity_id, policy
    ):
        raise HomeAssistantError("Camera access is not permitted")


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/camera/runtime/subscribe",
        vol.Required("entity_id"): cv.entity_id,
    }
)
@async_response
async def ws_camera_runtime_subscribe(
    hass: HomeAssistant,
    connection: ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Subscribe to normalized camera runtime state."""
    entity_id = msg["entity_id"]
    try:
        _require_entity_permission(connection, entity_id, POLICY_READ)
        service = runtime_from_hass(hass).camera_runtime
        initial = await service.async_snapshot(entity_id)
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "camera_runtime_failed", str(err))
        return

    def send(snapshot: dict[str, object]) -> None:
        connection.send_message(event_message(msg["id"], snapshot))

    connection.subscriptions[msg["id"]] = service.async_subscribe(
        entity_id, lambda snapshot: send(snapshot_dict(snapshot))
    )
    connection.send_result(msg["id"])
    send(snapshot_dict(initial))


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/camera/runtime/set",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("suspended"): bool,
        vol.Optional("resume_after_seconds"): vol.All(
            vol.Coerce(int), vol.Range(min=60, max=_MAX_RESUME_SECONDS)
        ),
    }
)
@async_response
async def ws_camera_runtime_set(
    hass: HomeAssistant,
    connection: ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Suspend or resume one provider camera."""
    entity_id = msg["entity_id"]
    try:
        _require_entity_permission(connection, entity_id, POLICY_CONTROL)
        if connection.user is None or not connection.user.is_admin:
            raise HomeAssistantError("Administrator access is required")
        resume_seconds = msg.get("resume_after_seconds")
        snapshot = await runtime_from_hass(hass).camera_runtime.async_set_suspended(
            entity_id,
            msg["suspended"],
            timedelta(seconds=resume_seconds) if resume_seconds else None,
            Context(user_id=connection.user.id),
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "camera_runtime_failed", str(err))
        return
    except Exception:
        _LOGGER.exception("Unable to change runtime state for %s", entity_id)
        connection.send_error(
            msg["id"], "camera_runtime_failed", "Unable to change camera state"
        )
        return
    connection.send_result(msg["id"], snapshot_dict(snapshot))


def async_register(hass: HomeAssistant) -> None:
    """Register camera runtime WebSocket commands."""
    async_register_command(hass, ws_camera_runtime_subscribe)
    async_register_command(hass, ws_camera_runtime_set)
