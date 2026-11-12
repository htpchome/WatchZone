"""Home Assistant diagnostics export for WatchZone."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .runtime import WatchZoneRuntime


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant,
    config_entry: ConfigEntry[WatchZoneRuntime],
) -> dict[str, object]:
    """Return a detached snapshot of bounded backend diagnostics."""
    del hass
    return {"backend_log": config_entry.runtime_data.backend_log.snapshot()}
