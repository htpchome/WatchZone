"""Authenticated WebSocket boundary for provider-resolved reviews."""

from __future__ import annotations

from dataclasses import asdict
from time import time
from typing import Any

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
from ..providers.reviews import ReviewQuery
from . import runtime_from_hass


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/reviews/list",
        vol.Required("entity_id"): cv.entity_id,
        vol.Optional("after"): vol.Coerce(float),
        vol.Optional("before"): vol.Coerce(float),
        vol.Optional("limit", default=50): vol.All(
            vol.Coerce(int), vol.Range(min=1, max=500)
        ),
        vol.Optional("bypass_cache", default=False): cv.boolean,
        vol.Optional("summary_only", default=False): cv.boolean,
    }
)
@async_response
async def ws_reviews_list(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return an authoritative, newest-first review activity window."""
    entity_id = msg["entity_id"]
    if connection.user is None or not connection.user.permissions.check_entity(
        entity_id, POLICY_READ
    ):
        connection.send_error(
            msg["id"], "reviews_forbidden", "Camera access is not permitted"
        )
        return
    before = msg.get("before", time())
    after = msg.get("after", before - 5 * 24 * 60 * 60)
    try:
        items = await runtime_from_hass(hass).reviews.async_list(
            entity_id,
            ReviewQuery(
                after,
                before,
                msg["limit"],
                msg["bypass_cache"],
                not msg["summary_only"],
            ),
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "reviews_list_failed", str(err))
        return
    connection.send_result(msg["id"], {"items": [asdict(item) for item in items]})


@callback
def async_register(hass: HomeAssistant) -> None:
    async_register_command(hass, ws_reviews_list)
