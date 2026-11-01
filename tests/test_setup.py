"""Tests for WatchZone setup and frontend registration."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.components.lovelace.dashboard import LovelaceStorage
from homeassistant.components.lovelace.resources import (
    ResourceStorageCollection,
    ResourceYAMLCollection,
)
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
    """Config-entry lifecycle controls an awaited Lovelace module resource."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    resources = ResourceStorageCollection(hass, LovelaceStorage(hass, None))
    hass.data[LOVELACE_DATA] = SimpleNamespace(resources=resources)

    assert await async_setup_entry(hass, entry)
    assert entry.runtime_data.entry_id == entry.entry_id
    assert resources.async_items() == [
        {
            "id": resources.async_items()[0]["id"],
            "type": "module",
            "url": CARD_MODULE_URL,
        }
    ]

    assert await async_unload_entry(hass, entry)
    assert resources.async_items() == []


async def test_entry_updates_existing_card_resource(hass: HomeAssistant) -> None:
    """A version change updates one existing resource instead of duplicating it."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    resources = ResourceStorageCollection(hass, LovelaceStorage(hass, None))
    hass.data[LOVELACE_DATA] = SimpleNamespace(resources=resources)
    existing = await resources.async_create_item(
        {"res_type": "module", "url": "/watchzone/frontend/watchzone.js?v=old"}
    )

    assert await async_setup_entry(hass, entry)

    assert resources.async_items() == [
        {"id": existing["id"], "type": "module", "url": CARD_MODULE_URL}
    ]


async def test_entry_registers_runtime_resource_in_yaml_mode(
    hass: HomeAssistant,
) -> None:
    """YAML resource mode receives an awaited runtime resource without extra JS."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    resources = ResourceYAMLCollection([])
    hass.data[LOVELACE_DATA] = SimpleNamespace(resources=resources)

    assert await async_setup_entry(hass, entry)
    assert resources.async_items() == [{"type": "module", "url": CARD_MODULE_URL}]

    assert await async_unload_entry(hass, entry)
    assert resources.async_items() == []
