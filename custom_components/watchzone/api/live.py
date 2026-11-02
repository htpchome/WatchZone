"""Home Assistant WebSocket boundary for live signaling."""

from __future__ import annotations

import logging
from functools import partial
from typing import Any

import voluptuous as vol
from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components.websocket_api import async_register_command
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.components.websocket_api.decorators import (
    async_response,
    websocket_command,
)
from homeassistant.components.websocket_api.messages import (
    event_message,
    result_message,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from mashumaro import MissingField
from webrtc_models import RTCIceCandidateInit

from ..const import DATA_RUNTIME, DOMAIN, NAME
from ..runtime import WatchZoneRuntime

_LOGGER = logging.getLogger(__name__)


def _parse_candidate(value: Any) -> RTCIceCandidateInit:
    """Validate and parse a browser ICE candidate."""
    try:
        return RTCIceCandidateInit.from_dict(value)
    except (MissingField, ValueError) as err:
        raise vol.Invalid(str(err)) from err


def _runtime(hass: HomeAssistant) -> WatchZoneRuntime:
    """Return the configured runtime or report a useful API failure."""
    runtime = hass.data.get(DOMAIN, {}).get(DATA_RUNTIME)
    if not isinstance(runtime, WatchZoneRuntime):
        raise HomeAssistantError(f"{NAME} is not configured")
    return runtime


def _owner_id(connection: ActiveConnection) -> str:
    """Return the authenticated user's stable identifier."""
    if connection.user is None:
        raise HomeAssistantError("Authentication required")
    return f"{connection.user.id}:{id(connection)}"


def _require_camera_read(connection: ActiveConnection, entity_id: str) -> None:
    """Enforce Home Assistant entity read permissions."""
    if connection.user is None or not connection.user.permissions.check_entity(
        entity_id, POLICY_READ
    ):
        raise HomeAssistantError("Camera access is not permitted")


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/live/webrtc/offer",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("offer"): str,
    }
)
@async_response
async def ws_live_offer(
    hass: HomeAssistant,
    connection: ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Create a provider-resolved WebRTC signaling subscription."""
    entity_id = msg["entity_id"]
    try:
        _require_camera_read(connection, entity_id)
        runtime = _runtime(hass)

        @callback
        def send_event(event: dict[str, object]) -> None:
            connection.send_message(event_message(msg["id"], event))

        session_id = await runtime.live_signaling.async_create(
            _owner_id(connection), entity_id, send_event
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "webrtc_offer_failed", str(err))
        return

    connection.subscriptions[msg["id"]] = partial(
        runtime.live_signaling.close, session_id
    )
    connection.send_message(result_message(msg["id"]))
    send_event({"type": "session", "session_id": session_id})

    try:
        await runtime.live_signaling.async_start(session_id, msg["offer"])
    except Exception as err:
        _LOGGER.debug("Live WebRTC signaling failed: %s", err)
        send_event(
            {
                "type": "error",
                "message": "Camera WebRTC signaling failed",
            }
        )
        runtime.live_signaling.close(session_id)


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/live/webrtc/candidate",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("session_id"): str,
        vol.Required("candidate"): _parse_candidate,
    }
)
@async_response
async def ws_live_candidate(
    hass: HomeAssistant,
    connection: ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Forward a browser candidate to its provider signaling session."""
    try:
        _require_camera_read(connection, msg["entity_id"])
        await _runtime(hass).live_signaling.async_add_candidate(
            _owner_id(connection),
            msg["entity_id"],
            msg["session_id"],
            msg["candidate"],
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "webrtc_candidate_failed", str(err))
        return
    connection.send_message(result_message(msg["id"]))


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register WatchZone live WebSocket commands."""
    async_register_command(hass, ws_live_offer)
    async_register_command(hass, ws_live_candidate)
