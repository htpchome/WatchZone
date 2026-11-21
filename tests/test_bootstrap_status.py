"""Tests for the runtime-independent bootstrap status."""

from unittest.mock import MagicMock

from homeassistant.config_entries import ConfigEntryState

from custom_components.camera_optics.const import CONFIG_ENTRY_VERSION, DOMAIN, VERSION
from custom_components.camera_optics.features.bootstrap_status import bootstrap_status
from custom_components.camera_optics.runtime import CameraOpticsRuntime


def _hass_with_entries(*entries: object) -> MagicMock:
    hass = MagicMock()
    hass.config_entries.async_entries.return_value = list(entries)
    hass.data = {}
    return hass


def test_status_guides_unconfigured_installations() -> None:
    status = bootstrap_status(_hass_with_entries())

    assert status.state == "not_configured"
    assert status.backend_version == VERSION
    assert status.saved_settings_version is None
    assert status.supported_settings_version == CONFIG_ENTRY_VERSION


def test_status_reports_incompatible_saved_settings_before_runtime_setup() -> None:
    entry = MagicMock(
        state=ConfigEntryState.MIGRATION_ERROR,
        version=CONFIG_ENTRY_VERSION + 1,
    )

    status = bootstrap_status(_hass_with_entries(entry))

    assert status.state == "incompatible_settings"
    assert status.saved_settings_version == CONFIG_ENTRY_VERSION + 1


def test_status_reports_setup_failure_without_exposing_its_reason() -> None:
    entry = MagicMock(state=ConfigEntryState.SETUP_ERROR, version=2)

    status = bootstrap_status(_hass_with_entries(entry))

    assert status.state == "load_failed"


def test_status_reports_ready_only_for_the_configured_runtime() -> None:
    entry = MagicMock(state=ConfigEntryState.LOADED, version=2)
    hass = _hass_with_entries(entry)
    hass.data = {DOMAIN: {"runtime": MagicMock(spec=CameraOpticsRuntime)}}

    status = bootstrap_status(hass)

    assert status.state == "ready"
