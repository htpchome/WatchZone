"""Tests for Frigate persistent export compatibility."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

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
