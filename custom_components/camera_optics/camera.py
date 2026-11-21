"""CameraOptics-managed live-only substream camera entities."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from dataclasses import dataclass
from typing import override

from aiohttp import ClientWebSocketResponse, WSMsgType
from homeassistant.components.camera import (
    Camera,
    CameraEntityFeature,
)
from homeassistant.components.camera.helper import get_camera_from_entity_id
from homeassistant.components.camera.webrtc import (
    WebRTCAnswer,
    WebRTCCandidate,
    WebRTCError,
    WebRTCSendMessage,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_PASSWORD, CONF_URL, CONF_USERNAME
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from webrtc_models import RTCIceCandidateInit

from .const import (
    CONF_GO2RTC_STREAMS,
    CONF_SOURCE_CAMERAS,
    NAME,
    SUBENTRY_TYPE_EXTERNAL_GO2RTC,
    SUBENTRY_TYPE_HOME_ASSISTANT_SUBSTREAMS,
)
from .providers.go2rtc.client import (
    Go2RtcConnection,
    Go2RtcConnectionError,
    async_open_websocket,
)

ATTR_MANAGED_SUBSTREAM = "camera_optics_substream"
ATTR_SUBSTREAM_SOURCE = "camera_optics_substream_source"


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Create entities selected by typed CameraOptics child settings."""
    entities: list[Camera] = []
    for subentry in entry.subentries.values():
        if subentry.subentry_type == SUBENTRY_TYPE_HOME_ASSISTANT_SUBSTREAMS:
            entities.extend(
                HomeAssistantSubstreamCamera(entity_id)
                for entity_id in subentry.data.get(CONF_SOURCE_CAMERAS, [])
                if isinstance(entity_id, str)
            )
        elif subentry.subentry_type == SUBENTRY_TYPE_EXTERNAL_GO2RTC:
            connection = Go2RtcConnection(
                url=str(subentry.data.get(CONF_URL, "")),
                username=_optional_string(subentry.data.get(CONF_USERNAME)),
                password=_optional_string(subentry.data.get(CONF_PASSWORD)),
            )
            entities.extend(
                ExternalGo2RtcSubstreamCamera(
                    connection=connection,
                    server_id=subentry.subentry_id,
                    stream_name=stream_name,
                )
                for stream_name in subentry.data.get(CONF_GO2RTC_STREAMS, [])
                if isinstance(stream_name, str)
            )
    async_add_entities(entities)


class ManagedSubstreamCamera(Camera):
    """Base identity shared by live-only CameraOptics substream entities."""

    _attr_has_entity_name = True
    _attr_entity_registry_visible_default = False
    _attr_should_poll = False
    _attr_supported_features = CameraEntityFeature.STREAM

    def __init__(self, *, name: str, unique_id: str, source_type: str) -> None:
        super().__init__()
        self._attr_name = name
        self._attr_unique_id = unique_id
        self._attr_extra_state_attributes = {
            ATTR_MANAGED_SUBSTREAM: True,
            ATTR_SUBSTREAM_SOURCE: source_type,
        }


class HomeAssistantSubstreamCamera(ManagedSubstreamCamera):
    """Live-only entity delegating to an existing HA go2rtc-backed camera."""

    def __init__(self, source_entity_id: str) -> None:
        super().__init__(
            name=(
                source_entity_id.removeprefix("camera.").replace("_", " ").title()
                + " Substream"
            ),
            unique_id=f"home_assistant:{source_entity_id}",
            source_type="home_assistant_go2rtc",
        )
        self._source_entity_id = source_entity_id

    @property
    @override
    def available(self) -> bool:
        """Mirror whether the selected source camera is available."""
        state = self.hass.states.get(self._source_entity_id)
        return state is not None and state.state not in {"unavailable", "unknown"}

    async def stream_source(self) -> str | None:
        """Reuse the source camera's public stream source for HLS fallback."""
        return await self._source_camera().stream_source()

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        """Reuse the source camera's current still image."""
        return await self._source_camera().async_camera_image(width, height)

    async def async_handle_async_webrtc_offer(
        self, offer_sdp: str, session_id: str, send_message: WebRTCSendMessage
    ) -> None:
        """Delegate signaling to the source camera's registered provider."""
        await self._source_camera().async_handle_async_webrtc_offer(
            offer_sdp, session_id, send_message
        )

    async def async_on_webrtc_candidate(
        self, session_id: str, candidate: RTCIceCandidateInit
    ) -> None:
        """Delegate one ICE candidate to the source camera."""
        await self._source_camera().async_on_webrtc_candidate(session_id, candidate)

    @callback
    @override
    def close_webrtc_session(self, session_id: str) -> None:
        """Close the delegated source-camera session."""
        try:
            source = self._source_camera()
        except HomeAssistantError:
            return
        source.close_webrtc_session(session_id)

    def _source_camera(self) -> Camera:
        try:
            return get_camera_from_entity_id(self.hass, self._source_entity_id)
        except HomeAssistantError as err:
            raise HomeAssistantError(
                "Configured substream source is unavailable"
            ) from err


@dataclass(slots=True)
class _ExternalSession:
    websocket: ClientWebSocketResponse
    reader_task: asyncio.Task[None]


class ExternalGo2RtcSubstreamCamera(ManagedSubstreamCamera):
    """Live-only camera using an explicitly configured external go2rtc stream."""

    def __init__(
        self,
        *,
        connection: Go2RtcConnection,
        server_id: str,
        stream_name: str,
    ) -> None:
        super().__init__(
            name=stream_name,
            unique_id=f"external:{server_id}:{stream_name}",
            source_type="external_go2rtc",
        )
        self._connection = connection
        self._stream_name = stream_name
        self._sessions: dict[str, _ExternalSession] = {}

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        """External managed substreams intentionally expose live video only."""
        return None

    async def async_handle_async_webrtc_offer(
        self, offer_sdp: str, session_id: str, send_message: WebRTCSendMessage
    ) -> None:
        """Open authenticated signaling and relay the browser offer."""
        await self._async_close_session(session_id)
        try:
            websocket = await async_open_websocket(
                self.hass, self._connection, self._stream_name
            )
        except Go2RtcConnectionError:
            send_message(
                WebRTCError(
                    "camera_optics_go2rtc_unavailable",
                    "External go2rtc signaling is unavailable",
                )
            )
            return
        reader_task = self.hass.async_create_task(
            self._async_read_messages(session_id, websocket, send_message),
            f"{NAME} external go2rtc signaling",
        )
        self._sessions[session_id] = _ExternalSession(websocket, reader_task)
        await websocket.send_json({"type": "webrtc/offer", "value": offer_sdp})

    async def async_on_webrtc_candidate(
        self, session_id: str, candidate: RTCIceCandidateInit
    ) -> None:
        """Forward one browser ICE candidate to external go2rtc."""
        if session := self._sessions.get(session_id):
            if candidate.candidate:
                await session.websocket.send_json(
                    {"type": "webrtc/candidate", "value": candidate.candidate}
                )

    @callback
    @override
    def close_webrtc_session(self, session_id: str) -> None:
        """Schedule idempotent signaling cleanup."""
        self.hass.async_create_task(self._async_close_session(session_id))

    async def async_will_remove_from_hass(self) -> None:
        """Close every external socket before removing the entity."""
        await asyncio.gather(
            *(
                self._async_close_session(session_id)
                for session_id in list(self._sessions)
            )
        )
        await super().async_will_remove_from_hass()

    async def _async_read_messages(
        self,
        session_id: str,
        websocket: ClientWebSocketResponse,
        send_message: WebRTCSendMessage,
    ) -> None:
        try:
            async for message in websocket:
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
                    send_message(WebRTCAnswer(value))
                elif message_type == "webrtc/candidate" and isinstance(value, str):
                    send_message(WebRTCCandidate(RTCIceCandidateInit(value)))
                elif message_type == "error":
                    send_message(
                        WebRTCError(
                            "camera_optics_go2rtc_signaling_failed",
                            "External go2rtc rejected WebRTC signaling",
                        )
                    )
                    break
        except asyncio.CancelledError:
            raise
        except Exception:
            send_message(
                WebRTCError(
                    "camera_optics_go2rtc_signaling_failed",
                    "External go2rtc signaling failed",
                )
            )
        finally:
            session = self._sessions.get(session_id)
            if session is not None and session.websocket is websocket:
                self._sessions.pop(session_id, None)
            await websocket.close()

    async def _async_close_session(self, session_id: str) -> None:
        session = self._sessions.pop(session_id, None)
        if session is None:
            return
        if session.reader_task is not asyncio.current_task():
            session.reader_task.cancel()
            with suppress(asyncio.CancelledError):
                await session.reader_task
        await session.websocket.close()


def _optional_string(value: object) -> str | None:
    return value if isinstance(value, str) and value else None
