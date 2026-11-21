"""Tests for the authenticated external go2rtc client boundary."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from aiohttp import encode_basic_auth
from homeassistant.core import HomeAssistant
from yarl import URL

from custom_components.camera_optics.providers.go2rtc.client import (
    Go2RtcConnection,
    async_list_streams,
    async_open_websocket,
)


class _JsonResponse:
    """Minimal awaited aiohttp response used by the client boundary."""

    status = 200

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def json(self, *, content_type: None = None) -> object:
        del content_type
        return {"porch_low": {"consumers": []}, "porch": {}}


async def test_external_client_lists_streams_with_backend_basic_auth(
    hass: HomeAssistant,
) -> None:
    """Discovery authenticates server-side and returns normalized names only."""
    session = SimpleNamespace(get=AsyncMock(return_value=_JsonResponse()))
    connection = Go2RtcConnection(
        "https://go2rtc.example.test/base", "viewer", "secret"
    )

    with patch(
        "custom_components.camera_optics.providers.go2rtc.client.async_get_clientsession",
        return_value=session,
    ):
        streams = await async_list_streams(hass, connection)

    assert streams == ("porch", "porch_low")
    session.get.assert_awaited_once()
    request = session.get.await_args
    assert request.args == (URL("https://go2rtc.example.test/base/api/streams"),)
    assert request.kwargs["headers"] == {
        "Authorization": encode_basic_auth("viewer", "secret")
    }
    assert request.kwargs["timeout"].total == 10


async def test_external_client_opens_authenticated_stream_socket(
    hass: HomeAssistant,
) -> None:
    """Signaling derives a secure WebSocket URL without exposing credentials."""
    websocket = object()
    session = SimpleNamespace(ws_connect=AsyncMock(return_value=websocket))
    connection = Go2RtcConnection("https://go2rtc.example.test", "viewer", "secret")

    with patch(
        "custom_components.camera_optics.providers.go2rtc.client.async_get_clientsession",
        return_value=session,
    ):
        result = await async_open_websocket(hass, connection, "porch low")

    assert result is websocket
    session.ws_connect.assert_awaited_once_with(
        URL("wss://go2rtc.example.test/api/ws?src=porch+low"),
        headers={"Authorization": encode_basic_auth("viewer", "secret")},
    )
