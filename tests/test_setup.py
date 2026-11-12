"""Tests for WatchZone setup and frontend registration."""

from pathlib import Path
from types import MappingProxyType, SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.components.lovelace.dashboard import LovelaceStorage
from homeassistant.components.lovelace.resources import (
    ResourceStorageCollection,
    ResourceYAMLCollection,
)
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.watchzone import (
    _prewarm_camera_ids,
    _register_builtin_providers,
    async_migrate_entry,
    async_setup,
    async_setup_entry,
    async_unload_entry,
)
from custom_components.watchzone.const import (
    CAMERA_PRELOAD_TITLE,
    CARD_MODULE_URL,
    CONF_HLS_PREWARM_CAMERAS,
    DOMAIN,
    SUBENTRY_TYPE_CAMERA_PRELOAD,
    SUBENTRY_UNIQUE_ID_CAMERA_PRELOAD,
)
from custom_components.watchzone.providers.frigate import camera as frigate_camera
from custom_components.watchzone.providers.frigate import live as frigate_live


def test_builtin_provider_composition_is_idempotent(hass: HomeAssistant) -> None:
    """The composition root registers concrete built-ins exactly once."""
    first = _register_builtin_providers(hass)
    second = _register_builtin_providers(hass)

    assert second is first
    assert first.camera_runtime("frigate") is frigate_camera
    assert first.live_signaling("frigate") is frigate_live


async def test_migration_moves_legacy_prewarm_options_to_subentry(
    hass: HomeAssistant,
) -> None:
    """Version one entries keep their selected cameras without dual storage."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={
            CONF_HLS_PREWARM_CAMERAS: ["camera.porch", "camera.garage"],
            "unrelated": True,
        },
        version=1,
    )
    entry.add_to_hass(hass)

    assert await async_migrate_entry(hass, entry)

    assert entry.version == 2
    assert entry.options == {"unrelated": True}
    preload = entry.get_subentries_of_type(SUBENTRY_TYPE_CAMERA_PRELOAD)
    assert len(preload) == 1
    assert preload[0].title == CAMERA_PRELOAD_TITLE
    assert preload[0].unique_id == SUBENTRY_UNIQUE_ID_CAMERA_PRELOAD
    assert _prewarm_camera_ids(entry) == ["camera.porch", "camera.garage"]


async def test_setup_registers_packaged_frontend(
    hass: HomeAssistant, tmp_path: Path
) -> None:
    """The stable entry is uncached and hashed assets are cached."""
    card_path = tmp_path / "watchzone.js"
    card_path.write_text("", encoding="utf-8")
    asset_path = tmp_path / "assets"
    asset_path.mkdir()
    register = AsyncMock()
    register_view = Mock()

    with (
        patch("custom_components.watchzone._CARD_PATH", card_path),
        patch("custom_components.watchzone._ASSET_DIRECTORY", asset_path),
        patch.object(
            hass,
            "http",
            SimpleNamespace(
                async_register_static_paths=register,
                register_view=register_view,
            ),
        ),
    ):
        assert await async_setup(hass, {})

    paths = register.await_args.args[0]
    assert paths[0].cache_headers is False
    assert paths[1].cache_headers is True
    register_view.assert_called_once()


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


async def test_preload_subentry_update_reconciles_running_service(
    hass: HomeAssistant,
) -> None:
    """Editing the child tile updates one runtime owner without an entry reload."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        version=2,
        subentries_data=[
            {
                "subentry_type": SUBENTRY_TYPE_CAMERA_PRELOAD,
                "data": {CONF_HLS_PREWARM_CAMERAS: ["camera.porch"]},
                "title": CAMERA_PRELOAD_TITLE,
                "unique_id": SUBENTRY_UNIQUE_ID_CAMERA_PRELOAD,
            }
        ],
    )
    entry.add_to_hass(hass)
    resources = ResourceStorageCollection(hass, LovelaceStorage(hass, None))
    hass.data[LOVELACE_DATA] = SimpleNamespace(resources=resources)
    assert await async_setup_entry(hass, entry)
    preload = entry.get_subentries_of_type(SUBENTRY_TYPE_CAMERA_PRELOAD)[0]

    hass.config_entries.async_update_subentry(
        entry,
        preload,
        data=MappingProxyType(
            {CONF_HLS_PREWARM_CAMERAS: ["camera.garage", "camera.porch"]}
        ),
    )
    await hass.async_block_till_done()

    assert [
        status.entity_id for status in entry.runtime_data.hls_prewarm.diagnostics()
    ] == [
        "camera.garage",
        "camera.porch",
    ]


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
