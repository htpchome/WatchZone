"""Tests for the Python-owned stage design schema and store."""

import asyncio
from unittest.mock import AsyncMock

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from custom_components.watchzone.features.layouts import (
    StageDesignStore,
    validate_stage_design,
)
from custom_components.watchzone.features.layouts.store import StageRevisionConflict


def _design(*, revision: int = 0) -> dict[str, object]:
    camera = {
        "config": {},
        "id": "camera-module",
        "kind": "module",
        "moduleType": "camera",
        "slots": {
            "overlay": [
                {
                    "componentType": "ptz",
                    "config": {},
                    "id": "ptz-component",
                    "kind": "component",
                }
            ]
        },
    }
    return {
        "id": "default",
        "name": "Default",
        "revision": revision,
        "schemaVersion": 1,
        "variants": {
            name: {
                "root": {
                    "children": [
                        {
                            "grid": {
                                "column": 1,
                                "columnSpan": columns,
                                "row": 1,
                                "rowSpan": 1,
                            },
                            "node": camera,
                        }
                    ],
                    "columns": columns,
                    "id": "root",
                    "kind": "container",
                    "rows": ["fraction"],
                }
            }
            for name, columns in (("default", 12), ("phone", 4))
        },
    }


def test_stage_schema_preserves_module_component_and_slot_boundaries() -> None:
    """Camera owns placement while PTZ remains a portable overlay component."""
    design = validate_stage_design(_design())

    camera = design.variants["default"].root.children[0].node
    assert camera.module_type == "camera"
    assert camera.slots["overlay"][0].component_type == "ptz"
    assert design.as_json() == _design()


def test_stage_schema_preserves_optional_control_regions() -> None:
    """Control placement belongs to the slot renderer, not component config."""
    value = _design()
    variants = value["variants"]
    assert isinstance(variants, dict)
    default = variants["default"]
    assert isinstance(default, dict)
    root = default["root"]
    assert isinstance(root, dict)
    children = root["children"]
    assert isinstance(children, list)
    placement = children[0]
    assert isinstance(placement, dict)
    camera = placement["node"]
    assert isinstance(camera, dict)
    slots = camera["slots"]
    assert isinstance(slots, dict)
    overlay = slots["overlay"]
    assert isinstance(overlay, list)
    component = overlay[0]
    assert isinstance(component, dict)
    component["controlRegion"] = "trailing"

    design = validate_stage_design(value)

    assert (
        design.variants["default"]
        .root.children[0]
        .node.slots["overlay"][0]
        .control_region
        == "trailing"
    )
    assert design.as_json() == value


def test_stage_schema_rejects_invalid_control_regions() -> None:
    """Unrecognized placement regions cannot enter the persisted layout."""
    value = _design()
    variants = value["variants"]
    assert isinstance(variants, dict)
    default = variants["default"]
    assert isinstance(default, dict)
    root = default["root"]
    assert isinstance(root, dict)
    children = root["children"]
    assert isinstance(children, list)
    placement = children[0]
    assert isinstance(placement, dict)
    camera = placement["node"]
    assert isinstance(camera, dict)
    slots = camera["slots"]
    assert isinstance(slots, dict)
    overlay = slots["overlay"]
    assert isinstance(overlay, list)
    component = overlay[0]
    assert isinstance(component, dict)
    component["controlRegion"] = "floating"

    with pytest.raises(HomeAssistantError, match="Invalid control region"):
        validate_stage_design(value)


def test_stage_schema_rejects_duplicate_node_ids() -> None:
    """Stable IDs are unique within each responsive variant."""
    value = _design()
    variants = value["variants"]
    assert isinstance(variants, dict)
    default = variants["default"]
    assert isinstance(default, dict)
    root = default["root"]
    assert isinstance(root, dict)
    children = root["children"]
    assert isinstance(children, list)
    children.append(children[0])

    with pytest.raises(HomeAssistantError, match="Duplicate stage node ID"):
        validate_stage_design(value)


def test_stage_schema_allows_profile_specific_designs() -> None:
    """A user design may target desktop/tablet or phone without duplication."""
    value = _design()
    variants = value["variants"]
    assert isinstance(variants, dict)
    variants.pop("phone")

    design = validate_stage_design(value)

    assert tuple(design.variants) == ("default",)
    assert design.as_json() == value


def test_stage_schema_requires_at_least_one_variant() -> None:
    """A design with no eligible responsive profile cannot be saved."""
    value = _design()
    value["variants"] = {}

    with pytest.raises(HomeAssistantError, match="at least one variant"):
        validate_stage_design(value)


async def test_stage_store_uses_optimistic_revisions(hass: HomeAssistant) -> None:
    """A stale editor cannot overwrite a successfully saved design."""
    store = StageDesignStore(hass)
    store._store.async_save = AsyncMock()  # type: ignore[method-assign]

    saved = await store.async_save(_design(), expected_revision=0)

    assert saved.revision == 1
    assert store.get("default") is saved
    with pytest.raises(StageRevisionConflict):
        await store.async_save(_design(revision=1), expected_revision=0)


async def test_stage_store_serializes_competing_writes(hass: HomeAssistant) -> None:
    """Only one concurrent editor may commit the same expected revision."""
    store = StageDesignStore(hass)
    store._store.async_save = AsyncMock()  # type: ignore[method-assign]

    results = await asyncio.gather(
        store.async_save(_design(), expected_revision=0),
        store.async_save(_design(), expected_revision=0),
        return_exceptions=True,
    )

    assert sum(isinstance(result, StageRevisionConflict) for result in results) == 1
    assert store.get("default") is not None
    assert store.get("default").revision == 1
