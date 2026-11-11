"""Provider-neutral export library contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from homeassistant.core import HomeAssistant


@dataclass(frozen=True, slots=True)
class ExportRecord:
    """One provider-owned persistent video export."""

    id: str
    camera: str
    name: str
    created_time: float
    in_progress: bool
    revision: str


@dataclass(frozen=True, slots=True)
class ExportMediaResource:
    """One authenticated upstream export resource."""

    url: str
    headers: dict[str, str]
    content_type: str
    filename: str


@dataclass(frozen=True, slots=True)
class ExportRequest:
    """Provider-neutral request to preserve one recorded time range."""

    start_time: float
    end_time: float
    name: str


ExportMediaKind = Literal["thumbnail", "video"]


class ExportsProvider(Protocol):
    """Optional provider capability for persistent exported video."""

    async def async_list_exports(
        self, hass: HomeAssistant, entity_id: str
    ) -> tuple[ExportRecord, ...]:
        """Return exports belonging to one camera."""

    async def async_default_export_name(
        self,
        hass: HomeAssistant,
        entity_id: str,
        start_time: float,
        end_time: float,
    ) -> str:
        """Return the provider's default title for a recorded range."""

    async def async_create_export(
        self, hass: HomeAssistant, entity_id: str, request: ExportRequest
    ) -> None:
        """Create one persistent export from a recorded range."""

    async def async_rename_export(
        self, hass: HomeAssistant, entity_id: str, export_id: str, name: str
    ) -> None:
        """Rename one export."""

    async def async_delete_export(
        self, hass: HomeAssistant, entity_id: str, export_id: str
    ) -> None:
        """Delete one export."""

    async def async_resolve_export_media(
        self,
        hass: HomeAssistant,
        entity_id: str,
        export_id: str,
        kind: ExportMediaKind,
    ) -> ExportMediaResource:
        """Resolve one export resource for backend proxying."""
