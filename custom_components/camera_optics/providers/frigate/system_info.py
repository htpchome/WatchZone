"""Frigate environment information provider."""

from __future__ import annotations

import asyncio

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.loader import IntegrationNotFound, async_get_integration

from ..system_info import ProviderSystemInfo
from .source import async_get_frigate_client

_DOMAIN = "frigate"
_PROVIDER_ID = "frigate_go2rtc"


class FrigateSystemInfoProvider:
    """Resolve installed integration and connected Frigate server versions."""

    async def async_system_info(self, hass: HomeAssistant) -> ProviderSystemInfo:
        """Return sanitized Frigate environment information."""
        try:
            integration = await async_get_integration(hass, _DOMAIN)
        except IntegrationNotFound:
            return ProviderSystemInfo(
                provider_id=_PROVIDER_ID,
                product_name="Frigate",
                product_versions=(),
                integration_installed=False,
                integration_version=None,
            )

        entries = [
            entry
            for entry in hass.config_entries.async_entries(_DOMAIN)
            if entry.state is ConfigEntryState.LOADED
        ]
        versions = await asyncio.gather(
            *(self._async_server_version(hass, entry) for entry in entries)
        )
        return ProviderSystemInfo(
            provider_id=_PROVIDER_ID,
            product_name="Frigate",
            product_versions=tuple(sorted({value for value in versions if value})),
            integration_installed=True,
            integration_version=integration.version,
        )

    @staticmethod
    async def _async_server_version(
        hass: HomeAssistant, entry: ConfigEntry
    ) -> str | None:
        client = await async_get_frigate_client(hass, entry)
        if client is None or not hasattr(client, "async_get_version"):
            return None
        try:
            value = await client.async_get_version()
        except Exception:  # An unavailable optional provider must not break the editor.
            return None
        return value.strip() if isinstance(value, str) and value.strip() else None


system_info = FrigateSystemInfoProvider()
