"""Provider-resolved persistent export library."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from urllib.parse import quote

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er

from ..extensions import ProviderRegistry
from ..providers.exports import ExportMediaKind, ExportMediaResource, ExportsProvider


@dataclass(frozen=True, slots=True)
class ExportItem:
    """One frontend-safe persistent export."""

    id: str
    entity_id: str
    camera: str
    name: str
    created_time: float
    in_progress: bool
    thumbnail_path: str
    video_path: str
    download_path: str
    revision: str


class ExportsService:
    """Resolve exports without exposing provider details."""

    def __init__(self, hass: HomeAssistant, providers: ProviderRegistry) -> None:
        self._hass = hass
        self._providers = providers

    async def async_list(self, entity_ids: list[str]) -> tuple[ExportItem, ...]:
        """Return newest-first exports across the requested cameras."""
        batches = await asyncio.gather(
            *(self._list_entity(entity_id) for entity_id in entity_ids)
        )
        items = [item for batch in batches for item in batch]
        return tuple(sorted(items, key=lambda item: item.created_time, reverse=True))

    async def async_rename(self, entity_id: str, export_id: str, name: str) -> None:
        """Rename one export through its owning provider."""
        provider = self._provider(entity_id)
        await provider.async_rename_export(self._hass, entity_id, export_id, name)

    async def async_delete(self, entity_id: str, export_id: str) -> None:
        """Delete one export through its owning provider."""
        provider = self._provider(entity_id)
        await provider.async_delete_export(self._hass, entity_id, export_id)

    async def async_resolve_media(
        self, entity_id: str, export_id: str, kind: ExportMediaKind
    ) -> ExportMediaResource:
        """Resolve an export resource for the authenticated HTTP boundary."""
        provider = self._provider(entity_id)
        return await provider.async_resolve_export_media(
            self._hass, entity_id, export_id, kind
        )

    async def _list_entity(self, entity_id: str) -> tuple[ExportItem, ...]:
        entry = er.async_get(self._hass).async_get(entity_id)
        provider = self._providers.exports(entry.platform) if entry else None
        if provider is None:
            return ()
        records = await provider.async_list_exports(self._hass, entity_id)
        encoded_entity = quote(entity_id, safe="")
        return tuple(
            ExportItem(
                id=record.id,
                entity_id=entity_id,
                camera=record.camera,
                name=record.name,
                created_time=record.created_time,
                in_progress=record.in_progress,
                thumbnail_path=self._media_path(encoded_entity, record.id, "thumbnail"),
                video_path=self._media_path(encoded_entity, record.id, "video"),
                download_path=(
                    f"{self._media_path(encoded_entity, record.id, 'video')}"
                    "?download=true"
                ),
                revision=record.revision,
            )
            for record in records
        )

    def _provider(self, entity_id: str) -> ExportsProvider:
        entry = er.async_get(self._hass).async_get(entity_id)
        provider = self._providers.exports(entry.platform) if entry else None
        if provider is None:
            raise HomeAssistantError("Exports are unavailable for this camera")
        return provider

    @staticmethod
    def _media_path(entity_id: str, export_id: str, kind: ExportMediaKind) -> str:
        return (
            f"/api/watchzone/exports/media/{entity_id}/"
            f"{quote(export_id, safe='')}/{kind}"
        )

    async def async_close(self) -> None:
        """Release service resources."""
