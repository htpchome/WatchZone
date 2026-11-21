"""Authenticated external go2rtc client boundary."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from aiohttp import (
    ClientError,
    ClientResponseError,
    ClientTimeout,
    ClientWebSocketResponse,
    encode_basic_auth,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from yarl import URL

_REQUEST_TIMEOUT = ClientTimeout(total=10)


class Go2RtcConnectionError(Exception):
    """Base sanitized go2rtc connection failure."""


class Go2RtcAuthenticationError(Go2RtcConnectionError):
    """The server rejected supplied credentials."""


@dataclass(frozen=True, slots=True)
class Go2RtcConnection:
    """One externally configured go2rtc server."""

    url: str
    username: str | None = None
    password: str | None = None

    def auth_headers(self) -> dict[str, str] | None:
        """Build optional HTTP basic authentication headers."""
        if not self.username:
            return None
        return {"Authorization": encode_basic_auth(self.username, self.password or "")}


async def async_list_streams(
    hass: HomeAssistant, connection: Go2RtcConnection
) -> tuple[str, ...]:
    """Return bounded stream names from an authenticated go2rtc API."""
    session = async_get_clientsession(hass)
    try:
        response = await session.get(
            URL(connection.url) / "api/streams",
            headers=connection.auth_headers(),
            timeout=_REQUEST_TIMEOUT,
        )
        async with response:
            if response.status in {401, 403}:
                raise Go2RtcAuthenticationError
            if response.status != 200:
                raise Go2RtcConnectionError
            payload = await response.json(content_type=None)
    except Go2RtcConnectionError:
        raise
    except (ClientError, TimeoutError, ValueError) as err:
        raise Go2RtcConnectionError from err
    if not isinstance(payload, dict):
        raise Go2RtcConnectionError
    streams = {
        normalized
        for stream in payload
        if (normalized := _normalize_stream_name(stream)) is not None
    }
    return tuple(sorted(streams, key=str.casefold))


async def async_open_websocket(
    hass: HomeAssistant,
    connection: Go2RtcConnection,
    stream_name: str,
) -> ClientWebSocketResponse:
    """Open one authenticated trickle-ICE signaling socket."""
    base = URL(connection.url)
    scheme = "wss" if base.scheme == "https" else "ws"
    url = (base.with_scheme(scheme) / "api/ws") % {"src": stream_name}
    try:
        async with asyncio.timeout(10):
            return await async_get_clientsession(hass).ws_connect(
                url,
                headers=connection.auth_headers(),
            )
    except ClientResponseError as err:
        if err.status in {401, 403}:
            raise Go2RtcAuthenticationError from err
        raise Go2RtcConnectionError from err
    except (ClientError, TimeoutError) as err:
        raise Go2RtcConnectionError from err


def _normalize_stream_name(value: object) -> str | None:
    """Normalize a safe persisted go2rtc stream identifier."""
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if (
        not normalized
        or len(normalized) > 512
        or any(ord(character) < 32 or ord(character) == 127 for character in normalized)
    ):
        return None
    return normalized
