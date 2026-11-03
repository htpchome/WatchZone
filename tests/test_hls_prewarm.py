"""Tests for explicitly selected Home Assistant HLS pre-warming."""

import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from homeassistant.core import CoreState, HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from custom_components.watchzone.const import MAX_HLS_PREWARM_CAMERAS
from custom_components.watchzone.features.hls_prewarm import HlsPrewarmService


def _camera(
    *,
    original_preload: bool = False,
    order: list[str] | None = None,
    entity_id: str = "camera.test",
) -> SimpleNamespace:
    settings = SimpleNamespace(preload_stream=original_preload)
    output = SimpleNamespace(idle=True)
    outputs = {"hls": output}

    async def start() -> None:
        if order is not None:
            order.append(entity_id)

    stream = SimpleNamespace(
        dynamic_stream_settings=settings,
        add_provider=Mock(return_value=output),
        outputs=Mock(return_value=outputs),
        remove_provider=AsyncMock(side_effect=lambda provider: outputs.clear()),
        start=AsyncMock(side_effect=start),
    )
    return SimpleNamespace(
        stream=stream,
        async_create_stream=AsyncMock(return_value=stream),
    )


async def test_selected_cameras_warm_sequentially_and_restore(
    hass: HomeAssistant,
) -> None:
    """Selected entities share HA streams and release only owned keepalive."""
    hass.state = CoreState.running
    order: list[str] = []
    first = _camera(order=order, entity_id="camera.first")
    second = _camera(order=order, entity_id="camera.second")
    cameras = {"camera.first": first, "camera.second": second}
    service = HlsPrewarmService(hass)

    with patch.object(service, "_camera", side_effect=cameras.__getitem__):
        await service.async_setup(["camera.first", "camera.second"])
        await hass.async_block_till_done()

    assert order == ["camera.first", "camera.second"]
    assert first.stream.dynamic_stream_settings.preload_stream is True
    assert second.stream.dynamic_stream_settings.preload_stream is True
    assert [status.state for status in service.diagnostics()] == ["warm", "warm"]

    await service.async_close()

    assert first.stream.dynamic_stream_settings.preload_stream is False
    assert second.stream.dynamic_stream_settings.preload_stream is False
    first.stream.remove_provider.assert_awaited_once()
    second.stream.remove_provider.assert_awaited_once()


async def test_existing_home_assistant_preload_is_preserved(
    hass: HomeAssistant,
) -> None:
    """WatchZone never disables a preload setting it did not enable."""
    hass.state = CoreState.running
    camera = _camera(original_preload=True)
    service = HlsPrewarmService(hass)

    with patch.object(service, "_camera", return_value=camera):
        await service.async_setup(["camera.existing"])
        await hass.async_block_till_done()
    await service.async_close()

    assert camera.stream.dynamic_stream_settings.preload_stream is True
    camera.stream.remove_provider.assert_not_awaited()


async def test_allowlist_is_deduplicated_and_bounded(hass: HomeAssistant) -> None:
    """Malformed, duplicate, and excessive selections cannot grow server work."""
    hass.state = CoreState.not_running
    service = HlsPrewarmService(hass)
    selected = ["sensor.not_a_camera", "camera.0", "camera.0"] + [
        f"camera.{index}" for index in range(1, MAX_HLS_PREWARM_CAMERAS + 5)
    ]

    await service.async_setup(selected)

    diagnostics = service.diagnostics()
    assert len(diagnostics) == MAX_HLS_PREWARM_CAMERAS
    assert diagnostics[0].entity_id == "camera.0"
    assert diagnostics[-1].entity_id == f"camera.{MAX_HLS_PREWARM_CAMERAS - 1}"
    await service.async_close()


async def test_failed_start_restores_runtime_keepalive(hass: HomeAssistant) -> None:
    """A failed warm attempt leaves no falsely managed stream behind."""
    hass.state = CoreState.running
    camera = _camera()
    camera.stream.start.side_effect = RuntimeError("stream unavailable")
    service = HlsPrewarmService(hass)

    with patch.object(service, "_camera", return_value=camera):
        await service.async_setup(["camera.failed"])
        await hass.async_block_till_done()

    assert service.diagnostics()[0].state == "failed"
    assert camera.stream.dynamic_stream_settings.preload_stream is False
    await service.async_close()


async def test_camera_registration_race_stays_pending_and_recovers(
    hass: HomeAssistant, caplog: pytest.LogCaptureFixture
) -> None:
    """A selected entity may exist before its camera platform is registered."""
    hass.state = CoreState.running
    camera = _camera()
    service = HlsPrewarmService(hass)
    camera_helper = ModuleType("homeassistant.components.camera.helper")
    camera_helper.get_camera_from_entity_id = Mock(  # type: ignore[attr-defined]
        side_effect=[HomeAssistantError("Camera not found"), camera]
    )

    with patch.dict(
        sys.modules,
        {"homeassistant.components.camera.helper": camera_helper},
    ):
        await service.async_setup(["camera.starting"])
        await hass.async_block_till_done()
        assert service.diagnostics()[0].state == "pending"

        service._schedule_reconcile()  # noqa: SLF001
        await hass.async_block_till_done()

    assert service.diagnostics()[0].state == "warm"
    assert "Unable to pre-warm HLS" not in caplog.text
    await service.async_close()
