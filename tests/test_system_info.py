"""System information feature and Frigate provider tests."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import __version__ as HA_VERSION

from custom_components.watchzone.const import VERSION
from custom_components.watchzone.extensions import ProviderExtension, ProviderRegistry
from custom_components.watchzone.features.system_info import SystemInfoService
from custom_components.watchzone.providers.frigate import system_info as frigate_module
from custom_components.watchzone.providers.frigate.system_info import (
    FrigateSystemInfoProvider,
)
from custom_components.watchzone.providers.system_info import ProviderSystemInfo


class _SystemInfoProvider:
    async def async_system_info(self, hass: object) -> ProviderSystemInfo:
        del hass
        return ProviderSystemInfo(
            provider_id="test",
            product_name="Test Provider",
            product_versions=("2.0",),
            integration_installed=True,
            integration_version="1.0",
        )


@pytest.mark.asyncio
async def test_service_collects_registered_provider_information(hass) -> None:
    registry = ProviderRegistry()
    registry.register(
        ProviderExtension(
            api_version=2,
            provider_id="test",
            entity_platforms=frozenset({"test"}),
            system_info=_SystemInfoProvider(),
        )
    )

    info = await SystemInfoService(hass, registry).async_snapshot()

    assert info.home_assistant_version == HA_VERSION
    assert info.watchzone_version == VERSION
    assert info.providers[0].product_versions == ("2.0",)


@pytest.mark.asyncio
async def test_frigate_provider_reports_integration_and_server_versions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entry = SimpleNamespace(state=ConfigEntryState.LOADED)
    hass = MagicMock()
    hass.config_entries.async_entries.return_value = [entry]
    client = SimpleNamespace(async_get_version=AsyncMock(return_value="0.18.1"))
    monkeypatch.setattr(
        frigate_module,
        "async_get_integration",
        AsyncMock(return_value=SimpleNamespace(version="5.15.6")),
    )
    monkeypatch.setattr(
        frigate_module,
        "async_get_frigate_client",
        AsyncMock(return_value=client),
    )

    info = await FrigateSystemInfoProvider().async_system_info(hass)

    assert info.integration_installed is True
    assert info.integration_version == "5.15.6"
    assert info.product_versions == ("0.18.1",)
