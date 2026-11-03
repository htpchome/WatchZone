"""Tests for provider-resolved live WebRTC signaling."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from webrtc_models import RTCIceCandidateInit
from yarl import URL

from custom_components.watchzone.extensions import (
    EXTENSION_API_VERSION,
    ProviderExtension,
    ProviderRegistry,
)
from custom_components.watchzone.features.live import (
    HomeAssistantLiveSignalingSession,
    LiveSignalingService,
)
from custom_components.watchzone.providers.frigate.live import (
    FrigateLiveSignalingSession,
    _camera_name,
    _stream_name,
    async_prepare_session,
)


class _FakeHass:
    """Small task-owning Home Assistant stand-in."""

    def async_create_task(self, coroutine: object, name: str) -> asyncio.Task[None]:
        del name
        return asyncio.create_task(coroutine)  # type: ignore[arg-type]


class _FakeMessage:
    def __init__(self, payload: dict[str, object]) -> None:
        self._payload = payload

    def as_dict(self) -> dict[str, object]:
        return self._payload


async def test_standard_home_assistant_session_delegates_public_contract() -> None:
    """The generic fallback uses one HA camera session without provider knowledge."""
    camera = SimpleNamespace(
        async_handle_async_webrtc_offer=AsyncMock(),
        async_on_webrtc_candidate=AsyncMock(),
        close_webrtc_session=Mock(),
    )
    events: list[dict[str, object]] = []
    session = HomeAssistantLiveSignalingSession(
        camera,  # type: ignore[arg-type]
        "session-1",
        events.append,
    )
    assert session.signaling_path == "home_assistant:standard"

    await session.async_start("offer")
    callback = camera.async_handle_async_webrtc_offer.await_args.args[2]
    callback(_FakeMessage({"type": "answer", "answer": "answer"}))
    candidate = RTCIceCandidateInit.from_dict({"candidate": "candidate:browser"})
    await session.async_add_candidate(candidate)
    await session.async_close()

    camera.async_handle_async_webrtc_offer.assert_awaited_once_with(
        "offer", "session-1", callback
    )
    camera.async_on_webrtc_candidate.assert_awaited_once_with("session-1", candidate)
    camera.close_webrtc_session.assert_called_once_with("session-1")
    assert events == [{"type": "answer", "answer": "answer"}]


async def test_provider_resolver_loads_the_entity_owner_dynamically() -> None:
    """A future provider registers capabilities without joining the core package."""
    registry = SimpleNamespace(
        async_get=Mock(return_value=SimpleNamespace(platform="motioneye"))
    )
    provider_session = Mock()
    factory = AsyncMock(return_value=provider_session)
    module = SimpleNamespace(async_prepare_session=factory)
    hass = SimpleNamespace()
    providers = ProviderRegistry()
    providers.register(
        ProviderExtension(
            api_version=EXTENSION_API_VERSION,
            provider_id="motioneye-addon",
            entity_platforms=frozenset({"motioneye"}),
            live_signaling=module,
        )
    )
    service = LiveSignalingService(  # type: ignore[arg-type]
        hass,
        providers,
    )

    with (
        patch(
            "custom_components.watchzone.features.live.er.async_get",
            return_value=registry,
        ),
    ):
        resolved, fallback_reason = (  # noqa: SLF001
            await service._async_prepare_provider_session(
                Mock(), "camera.garden", Mock()
            )
        )

    factory.assert_awaited_once()
    assert resolved is provider_session
    assert fallback_reason is None


async def test_frigate_capability_uses_public_camera_identity_for_go2rtc() -> None:
    """A custom RTSP source falls back to Frigate's public camera identity."""
    registry = SimpleNamespace(
        async_get=Mock(
            return_value=SimpleNamespace(
                platform="frigate", config_entry_id="frigate-entry"
            )
        )
    )
    config_entry = SimpleNamespace(data={"url": "http://frigate:5000"})
    websocket = AsyncMock()
    websession = SimpleNamespace(ws_connect=AsyncMock(return_value=websocket))
    client = SimpleNamespace(
        validate_ssl=False,
        get_auth_headers=AsyncMock(return_value={"Authorization": "Bearer token"}),
    )
    frigate_module = SimpleNamespace(
        get_client_for_config_entry=Mock(return_value=client)
    )
    hass = SimpleNamespace(
        config_entries=SimpleNamespace(async_get_entry=Mock(return_value=config_entry)),
        states={"camera.porch": SimpleNamespace(attributes={"camera_name": "porch"})},
    )
    camera = SimpleNamespace(
        stream_source=AsyncMock(return_value="rtsp://custom-stream-host:8554/porch")
    )

    with (
        patch(
            "custom_components.watchzone.providers.frigate.live.er.async_get",
            return_value=registry,
        ),
        patch(
            "custom_components.watchzone.providers.frigate.live.import_module",
            return_value=frigate_module,
        ),
        patch(
            "custom_components.watchzone.providers.frigate.live.async_get_clientsession",
            return_value=websession,
        ),
    ):
        session = await async_prepare_session(
            hass,  # type: ignore[arg-type]
            camera,  # type: ignore[arg-type]
            "camera.porch",
            Mock(),
        )

    assert isinstance(session, FrigateLiveSignalingSession)
    assert session.signaling_path == "frigate:trickle_ice"
    websession.ws_connect.assert_awaited_once_with(
        URL("http://frigate:5000/live/webrtc/api/ws?src=porch"),
        headers={"Authorization": "Bearer token"},
        ssl=False,
    )


def test_frigate_stream_name_requires_its_go2rtc_source() -> None:
    """Custom RTSP sources do not get silently treated as Frigate go2rtc."""
    frigate_url = "http://frigate:5000"
    assert _stream_name("rtsp://frigate:8554/front_door", frigate_url) == "front_door"
    assert _stream_name("rtsp://another-server:8554/front_door", frigate_url) is None
    assert _stream_name("rtsp://frigate:554/front_door", frigate_url) is None
    assert _stream_name(None, frigate_url) is None


def test_frigate_camera_name_uses_its_public_entity_attribute() -> None:
    """Valid Frigate entities provide a canonical fallback stream identity."""
    hass = SimpleNamespace(
        states={"camera.porch": SimpleNamespace(attributes={"camera_name": " porch "})}
    )

    assert _camera_name(hass, "camera.porch") == "porch"  # type: ignore[arg-type]
    assert _camera_name(hass, "camera.missing") is None  # type: ignore[arg-type]
