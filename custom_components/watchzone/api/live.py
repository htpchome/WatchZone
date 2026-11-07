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

from ..const import DOMAIN
from ..providers.frigate.hls import async_prepare_hls_endpoint
from ..providers.frigate.source import async_resolve_source
from ..providers.live import ProviderPreparationError
from . import runtime_from_hass

_LOGGER = logging.getLogger(__name__)


def _parse_candidate(value: Any) -> RTCIceCandidateInit:
    """Validate and parse a browser ICE candidate."""
    try:
        return RTCIceCandidateInit.from_dict(value)
    except (MissingField, ValueError) as err:
        raise vol.Invalid(str(err)) from err


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
        vol.Required("type"): f"{DOMAIN}/live/source",
        vol.Required("connection"): vol.In(("home_assistant", "frigate_go2rtc")),
        vol.Required("entity_id"): cv.entity_id,
    }
)
@async_response
async def ws_live_source(
    hass: HomeAssistant,
    connection: ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Resolve an authorized typed live-source descriptor."""
    entity_id = msg["entity_id"]
    try:
        _require_camera_read(connection, entity_id)
        if msg["connection"] == "home_assistant":
            descriptor = {
                "id": f"home_assistant:{entity_id}",
                "type": "home_assistant",
            }
        else:
            source = await async_resolve_source(hass, entity_id)
            descriptor = {
                "id": source.source_id,
                "type": "frigate_go2rtc",
                "frigate_instance_id": source.frigate_instance_id,
                "stream_name": source.stream_name,
            }
    except (HomeAssistantError, ProviderPreparationError) as err:
        connection.send_error(msg["id"], "live_source_unavailable", str(err))
        return
    connection.send_result(msg["id"], descriptor)


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/live/frigate/hls",
        vol.Required("entity_id"): cv.entity_id,
    }
)
@async_response
async def ws_frigate_hls(
    hass: HomeAssistant,
    connection: ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Create an authenticated HA HLS endpoint for a validated Frigate source."""
    entity_id = msg["entity_id"]
    try:
        _require_camera_read(connection, entity_id)
        url = await async_prepare_hls_endpoint(hass, entity_id)
    except (HomeAssistantError, ProviderPreparationError) as err:
        connection.send_error(msg["id"], "frigate_hls_unavailable", str(err))
        return
    except TimeoutError:
        connection.send_error(
            msg["id"], "frigate_hls_unavailable", "Frigate HLS source timed out"
        )
        return
    connection.send_result(msg["id"], {"url": url})


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/live/camera/ready",
        vol.Required("entity_id"): cv.entity_id,
    }
)
@async_response
async def ws_live_camera_ready(
    hass: HomeAssistant,
    connection: ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Wait for a restored entity to become a usable Home Assistant camera."""
    entity_id = msg["entity_id"]
    try:
        _require_camera_read(connection, entity_id)
        ready = await runtime_from_hass(hass).camera_runtime.async_wait_ready(entity_id)
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "camera_ready_failed", str(err))
        return
    connection.send_result(msg["id"], {"ready": ready})


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/live/webrtc/offer",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("offer"): str,
        vol.Optional("provider", default="home_assistant"): vol.In(
            ("home_assistant", "frigate_go2rtc")
        ),
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
        runtime = runtime_from_hass(hass)

        @callback
        def send_event(event: dict[str, object]) -> None:
            connection.send_message(event_message(msg["id"], event))

        created = await runtime.live_signaling.async_create(
            _owner_id(connection),
            entity_id,
            send_event,
            provider_id=(
                "frigate_go2rtc"
                if msg["provider"] == "frigate_go2rtc"
                else None
            ),
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "webrtc_offer_failed", str(err))
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
        _LOGGER.debug("Live WebRTC signaling failed: %s", err)
        send_event(
            {
                "type": "error",
                "message": "Camera WebRTC signaling failed",
            }
        )
        runtime.live_signaling.close(created.session_id)


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
        await runtime_from_hass(hass).live_signaling.async_add_candidate(
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
    async_register_command(hass, ws_live_camera_ready)
    async_register_command(hass, ws_frigate_hls)
    async_register_command(hass, ws_live_source)
    async_register_command(hass, ws_live_offer)
    async_register_command(hass, ws_live_candidate)
