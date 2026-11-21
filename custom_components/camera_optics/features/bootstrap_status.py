"""Integration readiness visible before config-entry setup succeeds."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant

from ..const import CONFIG_ENTRY_VERSION, DATA_RUNTIME, DOMAIN, VERSION
from ..runtime import CameraOpticsRuntime

type BootstrapState = Literal[
    "incompatible_settings",
    "load_failed",
    "not_configured",
    "ready",
    "unavailable",
]


@dataclass(frozen=True, slots=True)
class BootstrapStatus:
    """Small, sanitized integration-readiness snapshot."""

    backend_version: str
    saved_settings_version: int | None
    state: BootstrapState
    supported_settings_version: int


def bootstrap_status(hass: HomeAssistant) -> BootstrapStatus:
    """Inspect local config-entry state without touching providers or runtime work."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        return BootstrapStatus(
            backend_version=VERSION,
            saved_settings_version=None,
            state="not_configured",
            supported_settings_version=CONFIG_ENTRY_VERSION,
        )

    entry = entries[0]
    if entry.version > CONFIG_ENTRY_VERSION:
        state: BootstrapState = "incompatible_settings"
    elif isinstance(
        hass.data.get(DOMAIN, {}).get(DATA_RUNTIME), CameraOpticsRuntime
    ):
        state = "ready"
    elif entry.state in {
        ConfigEntryState.MIGRATION_ERROR,
        ConfigEntryState.SETUP_ERROR,
        ConfigEntryState.SETUP_RETRY,
    }:
        state = "load_failed"
    else:
        state = "unavailable"

    return BootstrapStatus(
        backend_version=VERSION,
        saved_settings_version=entry.version,
        state=state,
        supported_settings_version=CONFIG_ENTRY_VERSION,
    )


def bootstrap_status_dict(status: BootstrapStatus) -> dict[str, object]:
    """Serialize the readiness snapshot at the API boundary."""
    return {
        "backend_version": status.backend_version,
        "saved_settings_version": status.saved_settings_version,
        "state": status.state,
        "supported_settings_version": status.supported_settings_version,
    }
