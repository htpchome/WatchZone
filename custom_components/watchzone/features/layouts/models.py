"""Strict declarative models for persisted WatchZone stage designs."""

from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from typing import Any, Literal, cast

from homeassistant.exceptions import HomeAssistantError

STAGE_SCHEMA_VERSION = 1
StageSlotName = Literal["content", "controls", "footer", "overlay"]
StageVariantName = Literal["default", "phone"]


@dataclass(frozen=True, slots=True)
class StageGridArea:
    """Logical grid placement independent of CSS pixels."""

    column: int
    column_span: int
    row: int
    row_span: int


@dataclass(frozen=True, slots=True)
class StageComponentNode:
    """Portable component placed into a module-owned slot."""

    component_type: str
    config: object
    id: str
    kind: Literal["component"] = "component"


@dataclass(frozen=True, slots=True)
class StageModuleNode:
    """Major stage content system with semantic component slots."""

    config: object
    id: str
    module_type: str
    slots: dict[StageSlotName, tuple[StageComponentNode, ...]]
    kind: Literal["module"] = "module"


@dataclass(frozen=True, slots=True)
class StagePlacement:
    """One module placement within a grid container."""

    grid: StageGridArea
    node: StageModuleNode


@dataclass(frozen=True, slots=True)
class StageContainerNode:
    """Grid container that owns placement only."""

    children: tuple[StagePlacement, ...]
    columns: int
    id: str
    kind: Literal["container"] = "container"


@dataclass(frozen=True, slots=True)
class StageVariant:
    """Responsive variant with stable logical node IDs."""

    root: StageContainerNode


@dataclass(frozen=True, slots=True)
class StageDesign:
    """Canonical persisted stage design."""

    id: str
    name: str
    revision: int
    variants: dict[StageVariantName, StageVariant]
    schema_version: int = STAGE_SCHEMA_VERSION

    def with_revision(self, revision: int) -> StageDesign:
        """Return the same validated design with a new store revision."""
        return replace(self, revision=revision)

    def as_json(self) -> dict[str, object]:
        """Serialize using the frontend's camelCase wire schema."""
        return cast(dict[str, object], _camelize(asdict(self)))


def validate_stage_design(value: object) -> StageDesign:
    """Validate untrusted JSON and return the canonical typed design."""
    source = _mapping(value, "Stage designs")
    if source.get("schemaVersion") != STAGE_SCHEMA_VERSION:
        raise HomeAssistantError("Unsupported stage schema version")
    variants = _mapping(source.get("variants"), "Stage variants")
    validated_variants: dict[StageVariantName, StageVariant] = {}
    for name in ("default", "phone"):
        if name in variants:
            validated_variants[name] = _variant(variants[name], name)
    if not validated_variants:
        raise HomeAssistantError("Stage designs must provide at least one variant")
    return StageDesign(
        id=_text(source.get("id"), "Stage design ID"),
        name=_text(source.get("name"), "Stage design name"),
        revision=_non_negative(source.get("revision"), "Stage revision"),
        variants=validated_variants,
    )


def _variant(value: object, name: str) -> StageVariant:
    ids: set[str] = set()
    source = _mapping(value, f"Stage variant {name}")
    return StageVariant(root=_container(source.get("root"), ids))


def _container(value: object, ids: set[str]) -> StageContainerNode:
    source = _mapping(value, "Stage container")
    node_id = _unique_id(source.get("id"), ids)
    children = source.get("children")
    if source.get("kind") != "container" or not isinstance(children, list):
        raise HomeAssistantError(f"Invalid stage container {node_id}")
    columns = _positive(source.get("columns"), "Stage columns")
    return StageContainerNode(
        children=tuple(_placement(item, columns, ids) for item in children),
        columns=columns,
        id=node_id,
    )


def _placement(value: object, columns: int, ids: set[str]) -> StagePlacement:
    source = _mapping(value, "Stage placement")
    grid = _mapping(source.get("grid"), "Stage grid area")
    column = _positive(grid.get("column"), "Stage column")
    column_span = _positive(grid.get("columnSpan"), "Stage column span")
    if column + column_span - 1 > columns:
        raise HomeAssistantError("Stage placement exceeds its container")
    return StagePlacement(
        grid=StageGridArea(
            column=column,
            column_span=column_span,
            row=_positive(grid.get("row"), "Stage row"),
            row_span=_positive(grid.get("rowSpan"), "Stage row span"),
        ),
        node=_module(source.get("node"), ids),
    )


def _module(value: object, ids: set[str]) -> StageModuleNode:
    source = _mapping(value, "Stage module")
    node_id = _unique_id(source.get("id"), ids)
    if source.get("kind") != "module":
        raise HomeAssistantError(f"Invalid stage module {node_id}")
    raw_slots = source.get("slots", {})
    slots_source = _mapping(raw_slots, "Stage slots")
    slots: dict[StageSlotName, tuple[StageComponentNode, ...]] = {}
    for name in ("content", "controls", "footer", "overlay"):
        raw_nodes = slots_source.get(name)
        if raw_nodes is None:
            continue
        if not isinstance(raw_nodes, list):
            raise HomeAssistantError(f"Stage slot {name} must be a list")
        slots[name] = tuple(_component(item, ids) for item in raw_nodes)
    return StageModuleNode(
        config=source.get("config"),
        id=node_id,
        module_type=_text(source.get("moduleType"), "Module type"),
        slots=slots,
    )


def _component(value: object, ids: set[str]) -> StageComponentNode:
    source = _mapping(value, "Stage component")
    node_id = _unique_id(source.get("id"), ids)
    if source.get("kind") != "component":
        raise HomeAssistantError(f"Invalid stage component {node_id}")
    return StageComponentNode(
        component_type=_text(source.get("componentType"), "Component type"),
        config=source.get("config"),
        id=node_id,
    )


def _mapping(value: object, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise HomeAssistantError(f"{label} must be an object")
    return value


def _text(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise HomeAssistantError(f"{label} must be a non-empty string")
    return value.strip()


def _unique_id(value: object, ids: set[str]) -> str:
    node_id = _text(value, "Stage node ID")
    if node_id in ids:
        raise HomeAssistantError(f"Duplicate stage node ID: {node_id}")
    ids.add(node_id)
    return node_id


def _positive(value: object, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        raise HomeAssistantError(f"{label} must be a positive integer")
    return value


def _non_negative(value: object, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise HomeAssistantError(f"{label} must be a non-negative integer")
    return value


def _camelize(value: object) -> Any:
    if isinstance(value, dict):
        return {_camel_key(key): _camelize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_camelize(item) for item in value]
    return value


def _camel_key(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.title() for part in rest)
