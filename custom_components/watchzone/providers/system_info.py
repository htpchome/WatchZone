"""Provider-owned environment information exposed to WatchZone."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from homeassistant.core import HomeAssistant


@dataclass(frozen=True, slots=True)
class ProviderSystemInfo:
    """Sanitized provider product and Home Assistant integration versions."""

    provider_id: str
    product_name: str
    product_versions: tuple[str, ...]
    integration_installed: bool
    integration_version: str | None


class SystemInfoProvider(Protocol):
    """Describe one provider without leaking clients or credentials."""

    async def async_system_info(self, hass: HomeAssistant) -> ProviderSystemInfo:
        """Return current provider environment information."""
