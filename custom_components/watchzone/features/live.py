"""Live WebRTC signaling use case."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from importlib import import_module
from typing import TYPE_CHECKING, Protocol, cast

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.util.ulid import ulid
from webrtc_models import RTCIceCandidateInit

from ..const import DOMAIN, NAME
from ..providers.live import LiveSignalingSession, SendLiveSignalingEvent

if TYPE_CHECKING:
    from homeassistant.components.camera import Camera


class _ProviderSessionFactory(Protocol):
    async def __call__(
        self,
        hass: HomeAssistant,
        camera: Camera,
        entity_id: str,
        send_event: SendLiveSignalingEvent,
    ) -> LiveSignalingSession | None:
        """Prepare an optional concrete provider signaling capability."""


class HomeAssistantLiveSignalingSession:
    """Delegate signaling to the selected Home Assistant camera implementation."""

    signaling_path = "home_assistant:standard"

    def __init__(
        self,
        camera: Camera,
        session_id: str,
        send_event: SendLiveSignalingEvent,
    ) -> None:
        self._camera = camera
        self._session_id = session_id
        self._send_event = send_event

    async def async_start(self, offer: str) -> None:
        """Pass the offer through Home Assistant's public camera contract."""
        await self._camera.async_handle_async_webrtc_offer(
            offer,
            self._session_id,
            lambda message: self._send_event(message.as_dict()),
        )

    async def async_add_candidate(self, candidate: RTCIceCandidateInit) -> None:
        """Forward one browser ICE candidate through Home Assistant."""
        await self._camera.async_on_webrtc_candidate(self._session_id, candidate)

    async def async_close(self) -> None:
        """Close the Home Assistant camera session."""
        self._camera.close_webrtc_session(self._session_id)


@dataclass(slots=True)
class _OwnedSession:
    owner_id: str
    entity_id: str
    session: LiveSignalingSession


@dataclass(frozen=True, slots=True)
class CreatedLiveSignalingSession:
    """Public result of provider resolution for one signaling session."""

    session_id: str
    signaling_path: str


class LiveSignalingService:
    """Own active signaling sessions and select provider capabilities."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._sessions: dict[str, _OwnedSession] = {}

    async def async_create(
        self,
        owner_id: str,
        entity_id: str,
        send_event: SendLiveSignalingEvent,
    ) -> CreatedLiveSignalingSession:
        """Create one signaling session without starting negotiation."""
        from homeassistant.components.camera.const import StreamType
        from homeassistant.components.camera.helper import get_camera_from_entity_id

        camera = get_camera_from_entity_id(self._hass, entity_id)
        if StreamType.WEB_RTC not in camera.camera_capabilities.frontend_stream_types:
            raise HomeAssistantError("Camera does not support WebRTC")

        session_id = ulid()
        session = await self._async_prepare_provider_session(
            camera, entity_id, send_event
        )
        if session is None:
            session = HomeAssistantLiveSignalingSession(camera, session_id, send_event)
        self._sessions[session_id] = _OwnedSession(owner_id, entity_id, session)
        return CreatedLiveSignalingSession(session_id, session.signaling_path)

    async def async_start(self, session_id: str, offer: str) -> None:
        """Start a created signaling session."""
        await self._sessions[session_id].session.async_start(offer)

    async def async_add_candidate(
        self,
        owner_id: str,
        entity_id: str,
        session_id: str,
        candidate: RTCIceCandidateInit,
    ) -> None:
        """Forward a candidate only to its owning user's session."""
        owned = self._sessions.get(session_id)
        if owned is None or owned.owner_id != owner_id or owned.entity_id != entity_id:
            raise HomeAssistantError("WebRTC session not found")
        await owned.session.async_add_candidate(candidate)

    def close(self, session_id: str) -> None:
        """Schedule complete cleanup for one signaling session."""
        if owned := self._sessions.pop(session_id, None):
            self._hass.async_create_task(
                owned.session.async_close(),
                f"{NAME} WebRTC signaling cleanup",
            )

    async def async_close(self) -> None:
        """Close every session during integration unload."""
        sessions = [owned.session for owned in self._sessions.values()]
        self._sessions.clear()
        await asyncio.gather(
            *(session.async_close() for session in sessions),
            return_exceptions=True,
        )

    async def _async_prepare_provider_session(
        self,
        camera: Camera,
        entity_id: str,
        send_event: SendLiveSignalingEvent,
    ) -> LiveSignalingSession | None:
        """Load and prepare an eligible concrete provider only on demand."""
        registry_entry = er.async_get(self._hass).async_get(entity_id)
        if registry_entry is None:
            return None
        try:
            module = import_module(
                f"custom_components.{DOMAIN}.providers.{registry_entry.platform}.live"
            )
            factory = cast(_ProviderSessionFactory, module.async_prepare_session)
            return await factory(self._hass, camera, entity_id, send_event)
        except Exception:
            return None
