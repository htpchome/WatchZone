"""Tests for provider-owned camera suspension and resume scheduling."""

import asyncio
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from homeassistant.core import Context, HomeAssistant

from custom_components.watchzone.extensions import (
    EXTENSION_API_VERSION,
    ProviderExtension,
    ProviderRegistry,
)
from custom_components.watchzone.features.camera_runtime import (
    CameraRuntimeService,
    CameraRuntimeSnapshot,
)
from custom_components.watchzone.providers.camera import CameraRuntimeState
from custom_components.watchzone.providers.frigate.camera import (
    async_get_state,
    async_set_suspended,
)


async def test_frigate_camera_runtime_uses_public_camera_contract() -> None:
    """Frigate state and commands stay behind the provider capability."""
    services = SimpleNamespace(async_call=AsyncMock())
    hass = SimpleNamespace(
        services=services,
        states={
            "camera.porch": SimpleNamespace(
                state="idle",
                attributes={
                    "camera_name": "porch",
                    "client_id": "frigate",
                    "supported_features": 0,
                },
            )
        },
    )

    state = await async_get_state(hass, "camera.porch")  # type: ignore[arg-type]

    assert state == CameraRuntimeState(
        available=True,
        provider="frigate",
        supported=True,
        suspended=True,
    )
    hass.states["camera.porch"] = SimpleNamespace(
        state="recording",
        attributes={
            "camera_name": "porch",
            "client_id": "frigate",
            "supported_features": 2,
        },
    )
    active_state = await async_get_state(  # type: ignore[arg-type]
        hass, "camera.porch"
    )
    assert active_state.suspended is False
    assert active_state.supported is True
    context = Context(user_id="user")
    await async_set_suspended(
        hass,  # type: ignore[arg-type]
        "camera.porch",
        False,
        context,
    )
    services.async_call.assert_awaited_once_with(
        "camera",
        "turn_on",
        {"entity_id": "camera.porch"},
        blocking=True,
        context=context,
    )


async def test_timed_suspension_preserves_provider_authority(
    hass: HomeAssistant,
) -> None:
    """A timer never overrides a provider-reported external resume."""
    provider_suspended = False

    async def get_state(
        _hass: HomeAssistant, _entity_id: str
    ) -> CameraRuntimeState:
        return CameraRuntimeState(
            available=True,
            provider="frigate",
            supported=True,
            suspended=provider_suspended,
        )

    async def set_suspended(
        _hass: HomeAssistant,
        _entity_id: str,
        suspended: bool,
        _context: Context | None,
    ) -> None:
        nonlocal provider_suspended
        provider_suspended = suspended

    provider = SimpleNamespace(
        async_get_state=get_state,
        async_set_suspended=AsyncMock(side_effect=set_suspended),
    )
    service = CameraRuntimeService(hass)
    service._store.async_save = AsyncMock()  # type: ignore[method-assign]

    with patch.object(service, "_provider", return_value=provider):
        snapshot = await service.async_set_suspended(
            "camera.porch",
            True,
            timedelta(hours=1, minutes=15),
            Context(user_id="user"),
        )
        provider_suspended = False
        externally_resumed = await service.async_snapshot("camera.porch")
        await service._async_reconcile("camera.porch")  # noqa: SLF001

    assert snapshot.resume_at is not None
    assert snapshot.supported is True
    assert snapshot.suspended is True
    assert externally_resumed.suspended is False
    assert externally_resumed.resume_at is not None
    assert provider.async_set_suspended.await_count == 1
    assert provider.async_set_suspended.await_args_list[0].args[2] is True
    assert "camera.porch" not in service._schedules  # noqa: SLF001
    assert service._store.async_save.await_count == 2  # type: ignore[attr-defined]
    await service.async_close()


async def test_runtime_changes_publish_to_every_subscribed_client(
    hass: HomeAssistant,
) -> None:
    """Provider-confirmed commands broadcast to every subscribed client."""
    provider_suspended = False

    async def get_state(
        _hass: HomeAssistant, _entity_id: str
    ) -> CameraRuntimeState:
        return CameraRuntimeState(
            available=True,
            provider="frigate",
            supported=True,
            suspended=provider_suspended,
        )

    async def set_suspended(
        _hass: HomeAssistant,
        _entity_id: str,
        suspended: bool,
        _context: Context | None,
    ) -> None:
        nonlocal provider_suspended
        provider_suspended = suspended

    provider = SimpleNamespace(
        async_get_state=get_state,
        async_set_suspended=set_suspended,
    )
    service = CameraRuntimeService(hass)
    service._store.async_save = AsyncMock()  # type: ignore[method-assign]
    first_listener = Mock()
    second_listener = Mock()

    with patch.object(service, "_provider", return_value=provider):
        unsubscribe_first = service.async_subscribe(
            "camera.porch", first_listener
        )
        unsubscribe_second = service.async_subscribe(
            "camera.porch", second_listener
        )
        await service.async_set_suspended(
            "camera.porch", True, None, Context(user_id="user")
        )
        await service.async_set_suspended(
            "camera.porch", False, None, Context(user_id="user")
        )

    assert [call.args[0].suspended for call in first_listener.call_args_list] == [
        True,
        False,
    ]
    assert [call.args[0].suspended for call in second_listener.call_args_list] == [
        True,
        False,
    ]
    unsubscribe_first()
    unsubscribe_second()
    await service.async_close()


async def test_external_provider_state_is_published_without_local_intent(
    hass: HomeAssistant,
) -> None:
    """An external provider resume replaces the suspended presentation."""
    provider_suspended = True

    async def get_state(
        _hass: HomeAssistant, _entity_id: str
    ) -> CameraRuntimeState:
        return CameraRuntimeState(
            available=True,
            provider="frigate",
            supported=True,
            suspended=provider_suspended,
        )

    provider = SimpleNamespace(async_get_state=get_state)
    providers = ProviderRegistry()
    providers.register(
        ProviderExtension(
            api_version=EXTENSION_API_VERSION,
            provider_id="test-provider",
            entity_platforms=frozenset({"test-camera"}),
            camera_runtime=provider,
            camera_runtime_poll_interval=0.01,
        )
    )
    service = CameraRuntimeService(hass, providers)
    observed: list[bool] = []
    resumed = asyncio.Event()

    def listener(snapshot: CameraRuntimeSnapshot) -> None:
        suspended = snapshot.suspended
        observed.append(suspended)
        if not suspended:
            resumed.set()

    registry = SimpleNamespace(
        async_get=Mock(return_value=SimpleNamespace(platform="test-camera"))
    )
    with patch(
        "custom_components.watchzone.features.camera_runtime.er.async_get",
        return_value=registry,
    ):
        initial = await service.async_snapshot("camera.porch")
        unsubscribe = service.async_subscribe(
            "camera.porch", listener, initial
        )
        provider_suspended = False
        await asyncio.wait_for(resumed.wait(), timeout=1)

    assert observed == [False]
    unsubscribe()
    await service.async_close()


async def test_camera_runtime_resolver_is_provider_extensible(
    hass: HomeAssistant,
) -> None:
    """Camera behavior resolves from the entity owner instead of a Frigate branch."""
    registry = SimpleNamespace(
        async_get=Mock(return_value=SimpleNamespace(platform="motioneye"))
    )
    provider = SimpleNamespace()
    providers = ProviderRegistry()
    unregister = providers.register(
        ProviderExtension(
            api_version=EXTENSION_API_VERSION,
            provider_id="motioneye-addon",
            entity_platforms=frozenset({"motioneye"}),
            camera_runtime=provider,
        )
    )
    service = CameraRuntimeService(hass, providers)

    with patch(
        "custom_components.watchzone.features.camera_runtime.er.async_get",
        return_value=registry,
    ):
        assert service._provider("camera.garden") is provider  # noqa: SLF001
        assert service._provider("camera.garden") is provider  # noqa: SLF001
        unregister()
        assert service._provider("camera.garden") is None  # noqa: SLF001
