"""Live WebRTC signaling use case."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import TYPE_CHECKING

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.util.ulid import ulid
from webrtc_models import RTCIceCandidateInit

from ..const import NAME
from ..extensions import ProviderRegistry, get_provider_registry
from ..providers.live import (
    LiveSignalingSession,
    ProviderPreparationError,
    SendLiveSignalingEvent,
)

if TYPE_CHECKING:
    from homeassistant.components.camera import Camera


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
    purpose: str
    session: LiveSignalingSession


@dataclass(frozen=True, slots=True)
class CreatedLiveSignalingSession:
    """Public result of provider resolution for one signaling session."""

    session_id: str
    signaling_path: str
    fallback_reason: str | None


class LiveSignalingService:
    """Own active signaling sessions and select provider capabilities."""

    def __init__(
        self,
        hass: HomeAssistant,
        providers: ProviderRegistry | None = None,
    ) -> None:
        self._hass = hass
        self._providers = providers or get_provider_registry(hass)
        self._sessions: dict[str, _OwnedSession] = {}
        self._closing_sessions: dict[tuple[str, str, str], asyncio.Task[None]] = {}

    async def async_create(
        self,
        owner_id: str,
        entity_id: str,
        send_event: SendLiveSignalingEvent,
        *,
        force_standard: bool = False,
        purpose: str = "live",
    ) -> CreatedLiveSignalingSession:
        """Create one signaling session without starting negotiation."""
        from homeassistant.components.camera.const import StreamType
        from homeassistant.components.camera.helper import get_camera_from_entity_id

        await self._async_wait_for_closing(owner_id, entity_id, purpose)
        camera = get_camera_from_entity_id(self._hass, entity_id)
        if StreamType.WEB_RTC not in camera.camera_capabilities.frontend_stream_types:
            raise HomeAssistantError("Camera does not support WebRTC")

        session_id = ulid()
        session: LiveSignalingSession | None = None
        fallback_reason: str | None = "standard_requested"
        if not force_standard:
            session, fallback_reason = await self._async_prepare_provider_session(
                camera, entity_id, send_event, purpose
            )
        if session is None:
            session = HomeAssistantLiveSignalingSession(camera, session_id, send_event)
        self._sessions[session_id] = _OwnedSession(
            owner_id, entity_id, purpose, session
        )
        return CreatedLiveSignalingSession(
            session_id, session.signaling_path, fallback_reason
        )

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
            key = (owned.owner_id, owned.entity_id, owned.purpose)
            previous = self._closing_sessions.get(key)

            async def close_in_order() -> None:
                if previous is not None:
                    await asyncio.gather(previous, return_exceptions=True)
                await owned.session.async_close()

            task = self._hass.async_create_task(
                close_in_order(),
                f"{NAME} WebRTC signaling cleanup",
            )
            self._closing_sessions[key] = task

            def forget_closing(completed: asyncio.Task[None]) -> None:
                self._forget_closing(key, completed)

            task.add_done_callback(forget_closing)

    async def async_close(self) -> None:
        """Close every session during integration unload."""
        sessions = [owned.session for owned in self._sessions.values()]
        closing = list(self._closing_sessions.values())
        self._sessions.clear()
        self._closing_sessions.clear()
        await asyncio.gather(
            *(session.async_close() for session in sessions),
            *closing,
            return_exceptions=True,
        )

    async def _async_wait_for_closing(
        self, owner_id: str, entity_id: str, purpose: str = "live"
    ) -> None:
        """Serialize replacement signaling behind complete prior cleanup."""
        if closing := self._closing_sessions.get((owner_id, entity_id, purpose)):
            await asyncio.gather(closing, return_exceptions=True)

    def _forget_closing(
        self, key: tuple[str, str, str], completed: asyncio.Task[None]
    ) -> None:
        """Remove only the cleanup generation that actually completed."""
        if self._closing_sessions.get(key) is completed:
            self._closing_sessions.pop(key, None)

    async def _async_prepare_provider_session(
        self,
        camera: Camera,
        entity_id: str,
        send_event: SendLiveSignalingEvent,
        purpose: str = "live",
    ) -> tuple[LiveSignalingSession | None, str | None]:
        """Load and prepare an eligible concrete provider only on demand."""
        registry_entry = er.async_get(self._hass).async_get(entity_id)
        if registry_entry is None:
            return None, "entity_registry_entry_missing"
        try:
            provider = (
                self._providers.talk_signaling(registry_entry.platform)
                if purpose == "talk"
                else self._providers.live_signaling(registry_entry.platform)
            )
            if provider is None:
                return None, "provider_adapter_unavailable"
            return await provider.async_prepare_session(
                self._hass, camera, entity_id, send_event
            ), None
        except ProviderPreparationError as err:
            return None, err.code
        except Exception:
            return None, "provider_adapter_failed"
