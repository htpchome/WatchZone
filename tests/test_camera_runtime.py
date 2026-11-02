"""Tests for provider-owned camera suspension and resume scheduling."""

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from homeassistant.core import Context, HomeAssistant

from custom_components.watchzone.features.camera_runtime import CameraRuntimeService
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
        states={"camera.porch": SimpleNamespace(state="idle")},
    )

    with patch(
        "custom_components.watchzone.providers.frigate.camera._camera_is_on",
        return_value=False,
    ):
        state = await async_get_state(hass, "camera.porch")  # type: ignore[arg-type]

    assert state == CameraRuntimeState(
        available=True,
        provider="frigate",
        supported=True,
        suspended=True,
    )
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


async def test_timed_suspension_is_persisted_and_reapplied(
    hass: HomeAssistant,
) -> None:
    """A provider restart cannot silently discard backend suspension intent."""
    provider = SimpleNamespace(
        async_get_state=AsyncMock(
            return_value=CameraRuntimeState(
                available=True,
                provider="frigate",
                supported=True,
                suspended=False,
            )
        ),
        async_set_suspended=AsyncMock(),
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
        await service._async_reconcile("camera.porch")  # noqa: SLF001

    assert snapshot.resume_at is not None
    assert snapshot.supported is True
    assert provider.async_set_suspended.await_count == 2
    assert provider.async_set_suspended.await_args_list[0].args[2] is True
    assert provider.async_set_suspended.await_args_list[1].args[2] is True
    service._store.async_save.assert_awaited_once()  # type: ignore[attr-defined]
    await service.async_close()


async def test_camera_runtime_resolver_is_provider_extensible(
    hass: HomeAssistant,
) -> None:
    """Camera behavior resolves from the entity owner instead of a Frigate branch."""
    registry = SimpleNamespace(
        async_get=Mock(return_value=SimpleNamespace(platform="motioneye"))
    )
    provider = SimpleNamespace()
    service = CameraRuntimeService(hass)

    with (
        patch(
            "custom_components.watchzone.features.camera_runtime.er.async_get",
            return_value=registry,
        ),
        patch(
            "custom_components.watchzone.features.camera_runtime.import_module",
            return_value=provider,
        ) as import_provider,
    ):
        assert service._provider("camera.garden") is provider  # noqa: SLF001

    import_provider.assert_called_once_with(
        "custom_components.watchzone.providers.motioneye.camera"
    )
