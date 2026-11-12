"""Tests for the provider-neutral exports service."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from homeassistant.core import Context

from custom_components.watchzone.features.exports import ExportsService


async def test_default_name_normalizes_provider_text() -> None:
    """Prepared titles use the same policy before reaching any frontend."""
    provider = SimpleNamespace(
        async_default_export_name=AsyncMock(return_value="  Visitor\x00\n clip  ")
    )
    service = ExportsService(SimpleNamespace(), SimpleNamespace())
    service._provider = Mock(return_value=provider)  # type: ignore[method-assign]

    assert (
        await service.async_default_name("camera.front", 10, 20) == "Visitor clip"
    )


async def test_create_normalizes_title_before_provider_boundary() -> None:
    """Create sends one normalized title to every provider implementation."""
    provider = SimpleNamespace(async_create_export=AsyncMock(return_value="export-1"))
    service = ExportsService(SimpleNamespace(), SimpleNamespace())
    service._provider = Mock(return_value=provider)  # type: ignore[method-assign]

    export_id = await service.async_create(
        "camera.front",
        10,
        20,
        "  Visitor\x00\n  clip  ",
        Context(user_id="user-1"),
    )

    assert export_id == "export-1"
    request = provider.async_create_export.await_args.args[2]
    assert request.name == "Visitor clip"


async def test_rename_normalizes_title_before_provider_boundary() -> None:
    """Rename applies the same normalization as create."""
    provider = SimpleNamespace(async_rename_export=AsyncMock())
    service = ExportsService(SimpleNamespace(), SimpleNamespace())
    service._provider = Mock(return_value=provider)  # type: ignore[method-assign]

    await service.async_rename(
        "camera.front", "export-1", "  Café\x00\n —   driveway  "
    )

    provider.async_rename_export.assert_awaited_once_with(
        service._hass,  # type: ignore[attr-defined]
        "camera.front",
        "export-1",
        "Café — driveway",
    )
