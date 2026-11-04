"""Home Assistant WebSocket boundary for two-way-talk signaling."""

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

from ..const import DOMAIN
from . import runtime_from_hass

_LOGGER = logging.getLogger(__name__)


def _owner_id(connection: ActiveConnection) -> str:
    if connection.user is None:
        raise HomeAssistantError("Authentication required")
    return f"{connection.user.id}:{id(connection)}"


def _require_camera_read(connection: ActiveConnection, entity_id: str) -> None:
    if connection.user is None or not connection.user.permissions.check_entity(
        entity_id, POLICY_READ
    ):
        raise HomeAssistantError("Camera access is not permitted")


def _parse_candidate(value: Any) -> RTCIceCandidateInit:
    try:
        return RTCIceCandidateInit.from_dict(value)
    except (MissingField, ValueError) as err:
        raise vol.Invalid(str(err)) from err


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/talk/capability",
        vol.Required("entity_id"): cv.entity_id,
    }
)
@async_response
async def ws_talk_capability(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Report whether the selected HA camera exposes WebRTC."""
    from homeassistant.components.camera.const import StreamType
    from homeassistant.components.camera.helper import get_camera_from_entity_id

    try:
        _require_camera_read(connection, msg["entity_id"])
        camera = get_camera_from_entity_id(hass, msg["entity_id"])
        supported = (
            StreamType.WEB_RTC in camera.camera_capabilities.frontend_stream_types
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "talk_capability_failed", str(err))
        return
    connection.send_result(msg["id"], {"supported": supported})


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/talk/webrtc/offer",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("offer"): str,
        vol.Optional("force_standard", default=False): bool,
    }
)
@async_response
async def ws_talk_offer(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Create an isolated provider-resolved microphone signaling session."""
    entity_id = msg["entity_id"]
    try:
        _require_camera_read(connection, entity_id)
        runtime = runtime_from_hass(hass)

        @callback
        def send_event(event: dict[str, object]) -> None:
            connection.send_message(event_message(msg["id"], event))

        created = await runtime.live_signaling.async_create(
            _owner_id(connection),
            entity_id,
            send_event,
            force_standard=msg["force_standard"],
            purpose="talk",
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "talk_offer_failed", str(err))
        return

    connection.subscriptions[msg["id"]] = partial(
        runtime.live_signaling.close, created.session_id
    )
    connection.send_message(result_message(msg["id"]))
    send_event(
        {
            "type": "session",
            "session_id": created.session_id,
            "signaling_path": created.signaling_path,
            "signaling_fallback_reason": created.fallback_reason,
        }
    )
    try:
        await runtime.live_signaling.async_start(created.session_id, msg["offer"])
    except Exception as err:
        _LOGGER.debug("Two-way-talk signaling failed: %s", err)
        send_event({"type": "error", "message": "Talk signaling failed"})
        runtime.live_signaling.close(created.session_id)


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/talk/webrtc/candidate",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("session_id"): str,
        vol.Required("candidate"): _parse_candidate,
    }
)
@async_response
async def ws_talk_candidate(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Forward one microphone peer ICE candidate."""
    try:
        _require_camera_read(connection, msg["entity_id"])
        await runtime_from_hass(hass).live_signaling.async_add_candidate(
            _owner_id(connection),
            msg["entity_id"],
            msg["session_id"],
            msg["candidate"],
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "talk_candidate_failed", str(err))
        return
    connection.send_message(result_message(msg["id"]))


@callback
def async_register(hass: HomeAssistant) -> None:
    async_register_command(hass, ws_talk_capability)
    async_register_command(hass, ws_talk_offer)
    async_register_command(hass, ws_talk_candidate)
