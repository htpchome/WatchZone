"""Tests for Frigate persistent export compatibility."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from homeassistant.core import Context
from homeassistant.exceptions import HomeAssistantError

from custom_components.watchzone.providers.exports import ExportRecord, ExportRequest
from custom_components.watchzone.providers.frigate.exports import (
    FrigateExportsProvider,
    _normalize_export,
)


def test_frigate_export_normalization_is_camera_scoped() -> None:
    """Mixed Frigate responses expose only exports owned by the camera."""
    assert (
        _normalize_export(
            {
                "id": "export-1",
                "camera": "front",
                "name": "Visitor",
                "date": 1_794_352_800,
                "in_progress": False,
            },
            "front",
        )
        is not None
    )
    assert (
        _normalize_export(
            {
                "id": "export-2",
                "camera": "driveway",
                "name": "Vehicle",
                "date": 1_794_352_900,
                "in_progress": False,
            },
            "front",
        )
        is None
    )


@pytest.mark.parametrize("status", [404, 405])
async def test_delete_falls_back_to_frigate_017(monkeypatch, status: int) -> None:
    """A missing 0.18 bulk endpoint falls back to the 0.17 delete route."""
    provider = FrigateExportsProvider()
    source = SimpleNamespace(camera_name="front")
    response = SimpleNamespace(status=status, release=Mock())
    request = AsyncMock(return_value=response)
    request_json = AsyncMock(return_value=None)
    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.exports.async_resolve_source",
        AsyncMock(return_value=source),
    )
    monkeypatch.setattr(provider, "_validate_export", AsyncMock())
    monkeypatch.setattr(provider, "_request", request)
    monkeypatch.setattr(provider, "_request_json", request_json)

    await provider.async_delete_export(SimpleNamespace(), "camera.front", "export-1")

    request.assert_awaited_once_with(
        SimpleNamespace(),
        source,
        "POST",
        "api/exports/delete",
        json_body={"ids": ["export-1"]},
        accepted_errors={404, 405},
    )
    request_json.assert_awaited_once_with(
        SimpleNamespace(), source, "DELETE", "api/export/export-1"
    )


async def test_delete_uses_frigate_018_bulk_endpoint(monkeypatch) -> None:
    """A supported 0.18 bulk endpoint completes without the legacy request."""
    provider = FrigateExportsProvider()
    source = SimpleNamespace(camera_name="front")
    response = SimpleNamespace(
        status=200,
        json=AsyncMock(return_value={"success": True}),
        release=Mock(),
    )
    request = AsyncMock(return_value=response)
    request_json = AsyncMock()
    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.exports.async_resolve_source",
        AsyncMock(return_value=source),
    )
    monkeypatch.setattr(provider, "_validate_export", AsyncMock())
    monkeypatch.setattr(provider, "_request", request)
    monkeypatch.setattr(provider, "_request_json", request_json)

    await provider.async_delete_export(SimpleNamespace(), "camera.front", "export-1")

    request.assert_awaited_once()
    request_json.assert_not_awaited()
    response.release.assert_called_once()


async def test_default_name_matches_frigate_format(monkeypatch) -> None:
    """The editable title begins with Frigate's generated title format."""
    provider = FrigateExportsProvider()
    source = SimpleNamespace(camera_name="front_door")
    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.exports.async_resolve_source",
        AsyncMock(return_value=source),
    )

    name = await provider.async_default_export_name(
        SimpleNamespace(), "camera.front", 0, 65
    )

    assert name == "front door 1970-01-01 00:00:00 1970-01-01 00:01:05"


async def test_create_uses_frigate_integration_service() -> None:
    """Creation delegates to Frigate's public Home Assistant entity service."""
    provider = FrigateExportsProvider()
    services = SimpleNamespace(
        has_service=Mock(return_value=True), async_call=AsyncMock()
    )
    hass = SimpleNamespace(services=services)
    context = Context(user_id="user-1")
    created = ExportRecord(
        id="front-abc123",
        camera="front",
        name="Front visitor",
        created_time=101,
        in_progress=True,
        revision="revision",
    )
    provider.async_list_exports = AsyncMock(side_effect=[(), (created,)])

    export_id = await provider.async_create_export(
        hass,
        "camera.front",
        ExportRequest(start_time=100.5, end_time=124.25, name="Front visitor"),
        context,
    )

    assert export_id == "front-abc123"
    services.async_call.assert_awaited_once_with(
        "frigate",
        "export_recording",
        {
            "playback_factor": "realtime",
            "start_time": "1970-01-01 00:01:40",
            "end_time": "1970-01-01 00:02:04",
            "name": "Front visitor",
        },
        blocking=True,
        context=context,
        target={"entity_id": "camera.front"},
    )


async def test_create_rejects_unverified_background_job(monkeypatch) -> None:
    """An accepted action is not success until its export enters the library."""
    provider = FrigateExportsProvider()
    services = SimpleNamespace(
        has_service=Mock(return_value=True), async_call=AsyncMock()
    )
    hass = SimpleNamespace(services=services)
    provider.async_list_exports = AsyncMock(return_value=())
    sleep = AsyncMock()
    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.exports._EXPORT_VERIFY_ATTEMPTS",
        2,
    )
    monkeypatch.setattr(
        "custom_components.watchzone.providers.frigate.exports.asyncio.sleep", sleep
    )

    with pytest.raises(
        HomeAssistantError,
        match="accepted the export request but did not create an export",
    ):
        await provider.async_create_export(
            hass,
            "camera.front",
            ExportRequest(start_time=100, end_time=124, name="Front visitor"),
            Context(user_id="user-1"),
        )

    services.async_call.assert_awaited_once()
    sleep.assert_awaited_once_with(1.0)


async def test_create_tolerates_transient_reconciliation_failure() -> None:
    """A temporary list failure after acceptance does not report false failure."""
    provider = FrigateExportsProvider()
    services = SimpleNamespace(
        has_service=Mock(return_value=True), async_call=AsyncMock()
    )
    hass = SimpleNamespace(services=services)
    created = ExportRecord(
        id="front-abc123",
        camera="front",
        name="Front visitor",
        created_time=101,
        in_progress=True,
        revision="revision",
    )
    provider.async_list_exports = AsyncMock(
        side_effect=[(), HomeAssistantError("temporary failure"), (created,)]
    )

    export_id = await provider.async_create_export(
        hass,
        "camera.front",
        ExportRequest(start_time=100, end_time=124, name="Front visitor"),
        Context(user_id="user-1"),
    )

    assert export_id == "front-abc123"
