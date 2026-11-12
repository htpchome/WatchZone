"""Tests for Home Assistant diagnostics export."""

import logging
from types import SimpleNamespace
from typing import Any, cast

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.watchzone.backend_log import BackendDiagnosticLog
from custom_components.watchzone.const import DOMAIN
from custom_components.watchzone.diagnostics import (
    async_get_config_entry_diagnostics,
)
from custom_components.watchzone.runtime import WatchZoneRuntime


async def test_diagnostics_returns_detached_backend_snapshot(
    hass: HomeAssistant,
) -> None:
    """HA diagnostics receives only the bounded sanitized backend history."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    backend_log = BackendDiagnosticLog(enabled=True)
    entry.runtime_data = SimpleNamespace(backend_log=backend_log)
    try:
        backend_log.record(logging.INFO, "lifecycle", "ready", "Backend ready")

        result = await async_get_config_entry_diagnostics(
            hass,
            cast(ConfigEntry[WatchZoneRuntime], cast(Any, entry)),
        )
        snapshot = result["backend_log"]
        assert isinstance(snapshot, dict)
        assert snapshot["enabled"] is True
        records = snapshot["records"]
        assert isinstance(records, list)
        assert records[-1]["code"] == "ready"

        records.clear()
        retained = backend_log.snapshot()["records"]
        assert isinstance(retained, list)
        assert retained
    finally:
        backend_log.close()
