"""Tests for provider-resolved live WebRTC signaling."""

import asyncio
import sys
from types import ModuleType, SimpleNamespace
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
    _OwnedSession,
)
from custom_components.watchzone.providers.frigate.live import (
    FrigateLiveSignalingSession,
    _camera_name,
    _stream_name,
    async_prepare_session,
)
from custom_components.watchzone.providers.frigate.source import async_resolve


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


async def test_replacement_signaling_waits_for_prior_cleanup() -> None:
    """A retry cannot overlap its predecessor's backend signaling session."""
    close_started = asyncio.Event()
    allow_close = asyncio.Event()

    async def close_session() -> None:
        close_started.set()
        await allow_close.wait()

    session = SimpleNamespace(async_close=close_session)
    service = LiveSignalingService(  # type: ignore[arg-type]
        _FakeHass(), ProviderRegistry()
    )
    service._sessions["session-1"] = _OwnedSession(  # noqa: SLF001
        "owner", "camera.porch", "live", session  # type: ignore[arg-type]
    )

    service.close("session-1")
    await close_started.wait()
    replacement = asyncio.create_task(
        service._async_wait_for_closing("owner", "camera.porch")  # noqa: SLF001
    )
    await asyncio.sleep(0)
    assert replacement.done() is False

    allow_close.set()
    await replacement


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


async def test_talk_resolver_uses_the_registered_talk_capability() -> None:
    """Talk resolution is separate from live and remains provider-neutral."""
    registry = SimpleNamespace(
        async_get=Mock(return_value=SimpleNamespace(platform="motioneye"))
    )
    live_factory = AsyncMock()
    talk_session = Mock()
    talk_factory = AsyncMock(return_value=talk_session)
    providers = ProviderRegistry()
    providers.register(
        ProviderExtension(
            api_version=EXTENSION_API_VERSION,
            provider_id="motioneye-addon",
            entity_platforms=frozenset({"motioneye"}),
            live_signaling=SimpleNamespace(async_prepare_session=live_factory),
            talk_signaling=SimpleNamespace(async_prepare_session=talk_factory),
        )
    )
    service = LiveSignalingService(SimpleNamespace(), providers)  # type: ignore[arg-type]

    with patch(
        "custom_components.watchzone.features.live.er.async_get",
        return_value=registry,
    ):
        resolved, fallback_reason = (  # noqa: SLF001
            await service._async_prepare_provider_session(
                Mock(), "camera.garden", Mock(), purpose="talk"
            )
        )

    talk_factory.assert_awaited_once()
    live_factory.assert_not_awaited()
    assert resolved is talk_session
    assert fallback_reason is None


async def test_explicit_provider_does_not_use_home_assistant_stream_gate() -> None:
    """A selected provider owns signaling eligibility without HA fallback rules."""
    provider_session = SimpleNamespace(signaling_path="frigate:trickle_ice")
    factory = AsyncMock(return_value=provider_session)
    providers = ProviderRegistry()
    providers.register(
        ProviderExtension(
            api_version=EXTENSION_API_VERSION,
            provider_id="frigate",
            entity_platforms=frozenset({"frigate"}),
            live_signaling=SimpleNamespace(async_prepare_session=factory),
        )
    )
    camera = SimpleNamespace(
        camera_capabilities=SimpleNamespace(frontend_stream_types=())
    )
    service = LiveSignalingService(_FakeHass(), providers)  # type: ignore[arg-type]

    camera_helper = ModuleType("homeassistant.components.camera.helper")
    camera_helper.get_camera_from_entity_id = Mock(  # type: ignore[attr-defined]
        return_value=camera
    )
    camera_const = ModuleType("homeassistant.components.camera.const")
    camera_const.StreamType = SimpleNamespace(WEB_RTC="web_rtc")  # type: ignore[attr-defined]
    with patch.dict(
        sys.modules,
        {
            "homeassistant.components.camera.const": camera_const,
            "homeassistant.components.camera.helper": camera_helper,
        },
    ):
        created = await service.async_create(
            "owner",
            "camera.porch",
            Mock(),
            provider_id="frigate",
        )

    assert factory.await_count == 1
    assert factory.await_args.args[:3] == (
        service._hass,  # noqa: SLF001
        camera,
        "camera.porch",
    )
    assert created.signaling_path == "frigate:trickle_ice"
    assert created.fallback_reason is None


async def test_frigate_browser_sources_keep_instance_routes_distinct() -> None:
    """Two Frigate entries cannot collide when camera and MQTT names differ."""
    registry = SimpleNamespace(
        async_get=Mock(
            side_effect=lambda entity_id: SimpleNamespace(
                platform="frigate",
                config_entry_id={
                    "camera.home": "entry-home",
                    "camera.workshop": "entry-workshop",
                }[entity_id],
            )
        )
    )
    fake_hass = SimpleNamespace(
        data={},
        states={
            "camera.home": SimpleNamespace(
                attributes={"camera_name": "porch", "client_id": "home_nvr"}
            ),
            "camera.workshop": SimpleNamespace(
                attributes={
                    "camera_name": "porch",
                    "client_id": "workshop_nvr",
                }
            ),
        },
    )

    with patch(
        "custom_components.watchzone.providers.frigate.source.er.async_get",
        return_value=registry,
    ):
        home = await async_resolve(fake_hass, "camera.home")  # type: ignore[arg-type]
        workshop = await async_resolve(  # type: ignore[arg-type]
            fake_hass, "camera.workshop"
        )

    assert home.provider_instance_id == "entry-home"
    assert workshop.provider_instance_id == "entry-workshop"
    assert home.websocket_path == (
        "/api/frigate/home_nvr/go2rtc/ws/api/ws?src=porch"
    )
    assert (
        workshop.websocket_path
        == "/api/frigate/workshop_nvr/go2rtc/ws/api/ws?src=porch"
    )


async def test_frigate_browser_source_uses_config_entry_route_identity() -> None:
    """Display titles and MQTT topics cannot replace Frigate's route identity."""
    registry = SimpleNamespace(
        async_get=Mock(
            return_value=SimpleNamespace(
                platform="frigate", config_entry_id="entry-workshop"
            )
        )
    )
    config_entry = SimpleNamespace(
        entry_id="entry-workshop",
        title="Any user-facing server name",
        data={"topic_prefix": "unrelated/topic"},
    )
    route_identity = Mock(return_value="workshop_client")
    fake_hass = SimpleNamespace(
        config_entries=SimpleNamespace(
            async_get_entry=Mock(return_value=config_entry)
        ),
        states={
            "camera.porch": SimpleNamespace(
                attributes={"camera_name": "porch"}
            )
        },
    )

    with (
        patch(
            "custom_components.watchzone.providers.frigate.source.er.async_get",
            return_value=registry,
        ),
        patch(
            "custom_components.watchzone.providers.frigate.source.async_import_module",
            new=AsyncMock(
                return_value=SimpleNamespace(
                    get_frigate_instance_id_for_config_entry=route_identity
                )
            ),
        ),
    ):
        source = await async_resolve(  # type: ignore[arg-type]
            fake_hass, "camera.porch"
        )

    route_identity.assert_called_once_with(fake_hass, config_entry)
    assert source.provider_instance_id == "entry-workshop"
    assert source.websocket_path == (
        "/api/frigate/workshop_client/go2rtc/ws/api/ws?src=porch"
    )


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
            "custom_components.watchzone.providers.frigate.live.async_import_module",
            new=AsyncMock(return_value=frigate_module),
        ) as import_frigate,
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
    import_frigate.assert_awaited_once_with(hass, "custom_components.frigate.views")
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
