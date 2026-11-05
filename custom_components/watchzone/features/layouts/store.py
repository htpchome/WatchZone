"""Atomic Home Assistant Store ownership for stage designs."""

from __future__ import annotations

import asyncio

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.storage import Store

from ...const import DOMAIN
from .models import StageDesign, validate_stage_design

_STORAGE_KEY = f"{DOMAIN}.stage_designs"
_STORAGE_VERSION = 1


class StageRevisionConflict(HomeAssistantError):
    """Raised when an editor attempts to overwrite a newer revision."""


class StageDesignStore:
    """Own validated global stage designs and optimistic revisions."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store[dict[str, object]](
            hass, _STORAGE_VERSION, _STORAGE_KEY, atomic_writes=True
        )
        self._designs: dict[str, StageDesign] = {}
        self._write_lock = asyncio.Lock()

    async def async_setup(self) -> None:
        """Load valid designs without allowing one corrupt item to block setup."""
        stored = await self._store.async_load() or {}
        raw_designs = stored.get("designs", [])
        if not isinstance(raw_designs, list):
            return
        for raw in raw_designs:
            try:
                design = validate_stage_design(raw)
            except HomeAssistantError:
                continue
            self._designs[design.id] = design

    def list(self) -> tuple[StageDesign, ...]:
        """Return a deterministic immutable snapshot."""
        return tuple(
            sorted(self._designs.values(), key=lambda item: item.name.casefold())
        )

    def get(self, design_id: str) -> StageDesign | None:
        """Return one saved design."""
        return self._designs.get(design_id)

    async def async_save(
        self, value: object, expected_revision: int | None
    ) -> StageDesign:
        """Validate and atomically save one optimistic revision."""
        candidate = validate_stage_design(value)
        async with self._write_lock:
            current = self._designs.get(candidate.id)
            current_revision = current.revision if current else 0
            if expected_revision is not None and expected_revision != current_revision:
                raise StageRevisionConflict("Stage design changed in another editor")
            saved = candidate.with_revision(current_revision + 1)
            next_designs = {**self._designs, saved.id: saved}
            await self._store.async_save(
                {"designs": [design.as_json() for design in next_designs.values()]}
            )
            self._designs = next_designs
            return saved
