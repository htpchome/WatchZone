"""Tests for WatchZone setup and frontend registration."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.watchzone import (
    async_setup,
    async_setup_entry,
    async_unload_entry,
)
from custom_components.watchzone.const import CARD_MODULE_URL, DOMAIN


async def test_setup_registers_packaged_frontend(
    hass: HomeAssistant, tmp_path: Path
) -> None:
    """The stable entry is uncached and hashed assets are cached."""
    card_path = tmp_path / "watchzone.js"
    card_path.write_text("", encoding="utf-8")
    asset_path = tmp_path / "assets"
    asset_path.mkdir()
    register = AsyncMock()

    with (
        patch("custom_components.watchzone._CARD_PATH", card_path),
        patch("custom_components.watchzone._ASSET_DIRECTORY", asset_path),
        patch.object(
            hass,
            "http",
            SimpleNamespace(async_register_static_paths=register),
        ),
    ):
        assert await async_setup(hass, {})

    paths = register.await_args.args[0]
    assert paths[0].cache_headers is False
    assert paths[1].cache_headers is True


async def test_entry_adds_and_removes_card_module(hass: HomeAssistant) -> None:
    """Config-entry lifecycle controls the registered card module."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)

    with (
        patch("custom_components.watchzone.add_extra_js_url") as add_url,
        patch("custom_components.watchzone.remove_extra_js_url") as remove_url,
    ):
        assert await async_setup_entry(hass, entry)
        add_url.assert_called_once_with(hass, CARD_MODULE_URL)
        assert entry.runtime_data.entry_id == entry.entry_id

        assert await async_unload_entry(hass, entry)
        remove_url.assert_called_once_with(hass, CARD_MODULE_URL)
