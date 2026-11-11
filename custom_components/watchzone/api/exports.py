"""Authenticated WebSocket and media boundaries for persistent exports."""

from __future__ import annotations

import math
from dataclasses import asdict
from datetime import timedelta
from typing import Any, cast

import voluptuous as vol
from aiohttp import ClientError, ClientTimeout, web
from aiohttp.helpers import content_disposition_header
from homeassistant.auth.permissions.const import POLICY_CONTROL, POLICY_READ
from homeassistant.components.http.auth import async_sign_path
from homeassistant.components.http.const import KEY_HASS_USER
from homeassistant.components.websocket_api import async_register_command
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.components.websocket_api.decorators import (
    async_response,
    websocket_command,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.http import KEY_HASS, HomeAssistantView

from ..const import DOMAIN
from ..providers.exports import ExportMediaKind
from . import runtime_from_hass

_MEDIA_TIMEOUT = ClientTimeout(total=None, sock_connect=15, sock_read=60)
_FORWARDED_HEADERS = {
    "accept-ranges",
    "cache-control",
    "content-length",
    "content-range",
    "etag",
    "last-modified",
}


def _strip_name(value: str) -> str:
    return value.strip()


_TIME_RANGE_SCHEMA: dict[Any, Any] = {
    vol.Required("entity_id"): cv.entity_id,
    vol.Required("start_time"): vol.Coerce(float),
    vol.Required("end_time"): vol.Coerce(float),
}


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/exports/list",
        vol.Required("entity_ids"): vol.All(
            cv.ensure_list, [cv.entity_id], vol.Length(min=1, max=16)
        ),
    }
)
@async_response
async def ws_exports_list(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return persistent exports across permitted cameras."""
    entity_ids = list(dict.fromkeys(msg["entity_ids"]))
    if connection.user is None or any(
        not connection.user.permissions.check_entity(entity_id, POLICY_READ)
        for entity_id in entity_ids
    ):
        connection.send_error(
            msg["id"], "exports_forbidden", "Camera access is not permitted"
        )
        return
    try:
        items = await runtime_from_hass(hass).exports.async_list(entity_ids)
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "exports_list_failed", str(err))
        return
    result = []
    for item in items:
        payload = asdict(item)
        payload["thumbnail_path"] = async_sign_path(
            hass, item.thumbnail_path, timedelta(hours=1)
        )
        result.append(payload)
    connection.send_result(msg["id"], {"items": result})


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/exports/prepare",
        **_TIME_RANGE_SCHEMA,
    }
)
@async_response
async def ws_exports_prepare(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the provider's default title for a proposed export."""
    if not _valid_range(msg) or not _can_read(connection, msg["entity_id"]):
        connection.send_error(
            msg["id"], "exports_forbidden", "Export range is not permitted"
        )
        return
    try:
        name = await runtime_from_hass(hass).exports.async_default_name(
            msg["entity_id"], msg["start_time"], msg["end_time"]
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "exports_prepare_failed", str(err))
        return
    connection.send_result(msg["id"], {"name": name})


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/exports/create",
        **_TIME_RANGE_SCHEMA,
        vol.Required("name"): vol.All(
            cv.string, _strip_name, vol.Length(min=1, max=256)
        ),
    }
)
@async_response
async def ws_exports_create(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Create one persistent export from a recorded range."""
    if not _valid_range(msg) or not _can_control(connection, msg["entity_id"]):
        connection.send_error(
            msg["id"], "exports_forbidden", "Export range is not permitted"
        )
        return
    try:
        await runtime_from_hass(hass).exports.async_create(
            msg["entity_id"],
            msg["start_time"],
            msg["end_time"],
            msg["name"],
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "exports_create_failed", str(err))
        return
    connection.send_result(msg["id"], {"success": True})


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/exports/rename",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("export_id"): cv.string,
        vol.Required("name"): vol.All(
            cv.string, _strip_name, vol.Length(min=1, max=256)
        ),
    }
)
@async_response
async def ws_exports_rename(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Rename one persistent export."""
    if not _can_control(connection, msg["entity_id"]):
        connection.send_error(
            msg["id"], "exports_forbidden", "Camera control is not permitted"
        )
        return
    try:
        await runtime_from_hass(hass).exports.async_rename(
            msg["entity_id"], msg["export_id"], msg["name"]
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "exports_rename_failed", str(err))
        return
    connection.send_result(msg["id"], {"success": True})


@websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/exports/delete",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("export_id"): cv.string,
    }
)
@async_response
async def ws_exports_delete(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Delete one persistent export."""
    if not _can_control(connection, msg["entity_id"]):
        connection.send_error(
            msg["id"], "exports_forbidden", "Camera control is not permitted"
        )
        return
    try:
        await runtime_from_hass(hass).exports.async_delete(
            msg["entity_id"], msg["export_id"]
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "exports_delete_failed", str(err))
        return
    connection.send_result(msg["id"], {"success": True})


class ExportMediaView(HomeAssistantView):
    """Permission-checked range-capable proxy for export media."""

    url = "/api/watchzone/exports/media/{entity_id}/{export_id}/{kind}"
    name = "api:watchzone:exports:media"

    async def get(
        self,
        request: web.Request,
        entity_id: str,
        export_id: str,
        kind: str,
    ) -> web.StreamResponse:
        """Stream one export thumbnail or video."""
        user = request.get(KEY_HASS_USER)
        if user is None or not user.permissions.check_entity(entity_id, POLICY_READ):
            raise web.HTTPForbidden()
        if kind not in {"thumbnail", "video"}:
            raise web.HTTPNotFound()
        upstream = None
        try:
            resource = await runtime_from_hass(
                request.app[KEY_HASS]
            ).exports.async_resolve_media(
                entity_id, export_id, cast(ExportMediaKind, kind)
            )
            headers = dict(resource.headers)
            if range_header := request.headers.get("Range"):
                headers["Range"] = range_header
            session = async_get_clientsession(request.app[KEY_HASS])
            upstream = await session.get(
                resource.url, headers=headers, timeout=_MEDIA_TIMEOUT
            )
            upstream.raise_for_status()
        except (ClientError, TimeoutError, HomeAssistantError) as err:
            if upstream is not None:
                upstream.release()
            raise web.HTTPBadGateway() from err
        response_headers = {
            key: value
            for key, value in upstream.headers.items()
            if key.lower() in _FORWARDED_HEADERS
        }
        if request.query.get("download") == "true":
            response_headers["Content-Disposition"] = content_disposition_header(
                "attachment", filename=resource.filename
            )
        response = web.StreamResponse(
            status=upstream.status,
            headers=response_headers,
        )
        response.content_type = upstream.content_type or resource.content_type
        await response.prepare(request)
        try:
            async for chunk in upstream.content.iter_chunked(64 * 1024):
                await response.write(chunk)
        finally:
            upstream.release()
        await response.write_eof()
        return response


def _can_control(connection: ActiveConnection, entity_id: str) -> bool:
    return bool(
        connection.user
        and connection.user.permissions.check_entity(entity_id, POLICY_CONTROL)
    )


def _can_read(connection: ActiveConnection, entity_id: str) -> bool:
    return bool(
        connection.user
        and connection.user.permissions.check_entity(entity_id, POLICY_READ)
    )


def _valid_range(msg: dict[str, Any]) -> bool:
    return bool(
        math.isfinite(msg["start_time"])
        and math.isfinite(msg["end_time"])
        and msg["start_time"] >= 0
        and msg["end_time"] > msg["start_time"]
    )


@callback
def async_register(hass: HomeAssistant) -> None:
    async_register_command(hass, ws_exports_list)
    async_register_command(hass, ws_exports_prepare)
    async_register_command(hass, ws_exports_create)
    async_register_command(hass, ws_exports_rename)
    async_register_command(hass, ws_exports_delete)
    hass.http.register_view(ExportMediaView())
