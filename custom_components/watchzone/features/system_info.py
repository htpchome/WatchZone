"""System information feature service."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from homeassistant.const import __version__ as HA_VERSION
from homeassistant.core import HomeAssistant

from ..const import VERSION
from ..extensions import ProviderRegistry
from ..providers.system_info import ProviderSystemInfo


@dataclass(frozen=True, slots=True)
class SystemInfo:
    """Versions safe to expose to an authenticated frontend."""

    home_assistant_version: str
    providers: tuple[ProviderSystemInfo, ...]
    watchzone_version: str


class SystemInfoService:
    """Collect environment information through registered provider contracts."""

    def __init__(self, hass: HomeAssistant, providers: ProviderRegistry) -> None:
        self._hass = hass
        self._providers = providers

    async def async_snapshot(self) -> SystemInfo:
        """Return a bounded snapshot without retaining provider results."""
        sources = self._providers.system_info_providers()
        results = await asyncio.gather(
            *(source.async_system_info(self._hass) for source in sources),
            return_exceptions=True,
        )
        provider_info = tuple(
            sorted(
                (
                    result
                    for result in results
                    if isinstance(result, ProviderSystemInfo)
                ),
                key=lambda result: result.provider_id,
            )
        )
        return SystemInfo(
            home_assistant_version=HA_VERSION,
            providers=provider_info,
            watchzone_version=VERSION,
        )


def system_info_dict(info: SystemInfo) -> dict[str, object]:
    """Serialize system information at the API boundary."""
    return {
        "home_assistant_version": info.home_assistant_version,
        "providers": [
            {
                "provider_id": provider.provider_id,
                "product_name": provider.product_name,
                "product_versions": list(provider.product_versions),
                "integration_installed": provider.integration_installed,
                "integration_version": provider.integration_version,
            }
            for provider in info.providers
        ],
        "watchzone_version": info.watchzone_version,
    }
