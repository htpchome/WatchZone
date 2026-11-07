"""Frigate live-signaling capability."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from typing import TYPE_CHECKING

from aiohttp import ClientError, ClientResponseError, ClientWebSocketResponse, WSMsgType
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from webrtc_models import RTCIceCandidateInit
from yarl import URL

from ...const import NAME
from ..live import (
    LiveSignalingSession,
    ProviderPreparationError,
    SendLiveSignalingEvent,
)
from .source import async_resolve_source

if TYPE_CHECKING:
    from homeassistant.components.camera import Camera

_GO2RTC_WEBSOCKET_PATH = "live/webrtc/api/ws"


class FrigateLiveSignalingSession:
    """Relay trickled WebRTC signaling through Frigate's go2rtc socket."""

    signaling_path = "frigate:trickle_ice"

    def __init__(
        self,
        hass: HomeAssistant,
        websocket: ClientWebSocketResponse,
        send_event: SendLiveSignalingEvent,
    ) -> None:
        self._hass = hass
        self._websocket = websocket
        self._send_event = send_event
        self._reader_task: asyncio.Task[None] | None = None
        self._closed = False

    async def async_start(self, offer: str) -> None:
        """Start relaying the browser offer and go2rtc responses."""
        if self._closed:
            return
        self._reader_task = self._hass.async_create_task(
            self._async_read_messages(),
            f"{NAME} Frigate WebRTC signaling",
        )
        await self._websocket.send_json({"type": "webrtc/offer", "value": offer})

    async def async_add_candidate(self, candidate: RTCIceCandidateInit) -> None:
        """Forward one browser ICE candidate to go2rtc."""
        if self._closed or not candidate.candidate:
            return
        await self._websocket.send_json(
            {"type": "webrtc/candidate", "value": candidate.candidate}
        )

    async def async_close(self) -> None:
        """Close the socket and reader idempotently."""
        if self._closed:
            return
        self._closed = True
        reader_task = self._reader_task
        if reader_task is not None and reader_task is not asyncio.current_task():
            reader_task.cancel()
            with suppress(asyncio.CancelledError):
                await reader_task
        await self._websocket.close()

    async def _async_read_messages(self) -> None:
        try:
            async for message in self._websocket:
                if message.type is not WSMsgType.TEXT:
                    if message.type in {
                        WSMsgType.CLOSE,
                        WSMsgType.CLOSED,
                        WSMsgType.ERROR,
                    }:
                        break
                    continue
                payload = message.json()
                if not isinstance(payload, dict):
                    continue
                message_type = payload.get("type")
                value = payload.get("value")
                if message_type == "webrtc/answer" and isinstance(value, str):
                    self._send_event({"type": "answer", "answer": value})
                elif message_type == "webrtc/candidate" and isinstance(value, str):
                    self._send_event(
                        {
                            "type": "candidate",
                            "candidate": {"candidate": value, "sdpMid": "0"},
                        }
                    )
                elif message_type == "error":
                    raise RuntimeError("Frigate rejected WebRTC signaling")
        except asyncio.CancelledError:
            raise
        except Exception:
            if not self._closed:
                self._send_event(
                    {
                        "type": "error",
                        "message": "Frigate WebRTC signaling failed",
                    }
                )
        else:
            if not self._closed:
                self._send_event(
                    {
                        "type": "error",
                        "message": "Frigate WebRTC signaling closed",
                    }
                )


async def async_prepare_session(
    hass: HomeAssistant,
    camera: Camera,
    entity_id: str,
    send_event: SendLiveSignalingEvent,
) -> LiveSignalingSession:
    """Prepare fast Frigate signaling or report a sanitized fallback reason."""
    source = await async_resolve_source(hass, entity_id, camera)
    url = (URL(source.base_url) / _GO2RTC_WEBSOCKET_PATH) % {
        "src": source.stream_name
    }
    try:
        headers = await source.client.get_auth_headers()
    except Exception as err:
        raise ProviderPreparationError("frigate_auth_failed") from err
    websession = async_get_clientsession(hass)
    try:
        websocket = await websession.ws_connect(
            url,
            headers=headers,
            ssl=source.client.validate_ssl,
        )
    except ClientResponseError as err:
        raise ProviderPreparationError("frigate_websocket_rejected") from err
    except (ClientError, TimeoutError) as err:
        raise ProviderPreparationError("frigate_websocket_unreachable") from err
    return FrigateLiveSignalingSession(hass, websocket, send_event)
