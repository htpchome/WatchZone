"""Frigate live-signaling capability."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from contextlib import suppress
from typing import TYPE_CHECKING, Protocol, cast

from aiohttp import ClientError, ClientResponseError, ClientWebSocketResponse, WSMsgType
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_URL
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.importlib import async_import_module
from webrtc_models import RTCIceCandidateInit
from yarl import URL

from ...const import NAME
from ..live import (
    LiveSignalingSession,
    ProviderPreparationError,
    SendLiveSignalingEvent,
)

if TYPE_CHECKING:
    from homeassistant.components.camera import Camera

_FRIGATE_DOMAIN = "frigate"
_GO2RTC_WEBSOCKET_PATH = "live/webrtc/api/ws"


class _FrigateClient(Protocol):
    """Narrow public Frigate client surface used by this capability."""

    validate_ssl: bool

    async def get_auth_headers(self) -> dict[str, str]:
        """Return current Frigate authentication headers."""


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
    registry_entry = er.async_get(hass).async_get(entity_id)
    if (
        registry_entry is None
        or registry_entry.platform != _FRIGATE_DOMAIN
        or registry_entry.config_entry_id is None
    ):
        raise ProviderPreparationError("frigate_entity_mismatch")

    config_entry = hass.config_entries.async_get_entry(registry_entry.config_entry_id)
    if config_entry is None or CONF_URL not in config_entry.data:
        raise ProviderPreparationError("frigate_config_entry_missing")

    base_url = config_entry.data[CONF_URL]
    if not isinstance(base_url, str):
        raise ProviderPreparationError("frigate_url_missing")
    stream_source = await camera.stream_source()
    stream_name = _stream_name(stream_source, base_url) or _camera_name(hass, entity_id)
    if stream_name is None:
        reason = (
            "frigate_stream_source_incompatible"
            if stream_source
            else "frigate_stream_source_unavailable"
        )
        raise ProviderPreparationError(reason)

    client = await async_get_frigate_client(hass, config_entry)
    if client is None:
        raise ProviderPreparationError("frigate_client_unavailable")
    url = (URL(base_url) / _GO2RTC_WEBSOCKET_PATH) % {"src": stream_name}
    try:
        headers = await client.get_auth_headers()
    except Exception as err:
        raise ProviderPreparationError("frigate_auth_failed") from err
    websession = async_get_clientsession(hass)
    try:
        websocket = await websession.ws_connect(
            url,
            headers=headers,
            ssl=client.validate_ssl,
        )
    except ClientResponseError as err:
        raise ProviderPreparationError("frigate_websocket_rejected") from err
    except (ClientError, TimeoutError) as err:
        raise ProviderPreparationError("frigate_websocket_unreachable") from err
    return FrigateLiveSignalingSession(hass, websocket, send_event)


def _stream_name(stream_source: str | None, frigate_url: str) -> str | None:
    """Resolve a Frigate go2rtc stream from its public camera stream source."""
    if not stream_source:
        return None
    source = URL(stream_source)
    if (
        source.scheme not in {"rtsp", "rtsps"}
        or source.port != 8554
        or source.host != URL(frigate_url).host
    ):
        return None
    name = source.path.strip("/")
    return name or None


def _camera_name(hass: HomeAssistant, entity_id: str) -> str | None:
    """Return the canonical camera name published by the Frigate entity."""
    state = hass.states.get(entity_id)
    if state is None:
        return None
    camera_name = state.attributes.get("camera_name")
    if not isinstance(camera_name, str):
        return None
    camera_name = camera_name.strip()
    return camera_name or None


async def async_get_frigate_client(
    hass: HomeAssistant, config_entry: ConfigEntry
) -> _FrigateClient | None:
    """Feature-detect the Frigate integration's authenticated API client."""
    try:
        module = await async_import_module(hass, "custom_components.frigate.views")
    except ModuleNotFoundError:
        return None

    if not hasattr(module, "get_client_for_config_entry"):
        return None
    get_client_for_config_entry = cast(
        Callable[[HomeAssistant, ConfigEntry], object | None],
        module.get_client_for_config_entry,
    )
    client = get_client_for_config_entry(hass, config_entry)
    if client is None or not hasattr(client, "get_auth_headers"):
        return None
    return cast(_FrigateClient, client)
