"""Frigate persistent export normalization and mutations."""

from __future__ import annotations

import hashlib
import json
from pathlib import PurePosixPath
from typing import Any

from aiohttp import ClientError, ClientResponse, ClientSession, ClientTimeout
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from yarl import URL

from ..exports import (
    ExportMediaKind,
    ExportMediaResource,
    ExportRecord,
    ExportsProvider,
)
from .source import FrigateSource, async_resolve_source

_REQUEST_TIMEOUT = ClientTimeout(total=15)


class FrigateExportsProvider:
    """Read and mutate Frigate's persistent export library."""

    async def async_list_exports(
        self, hass: HomeAssistant, entity_id: str
    ) -> tuple[ExportRecord, ...]:
        source = await async_resolve_source(hass, entity_id)
        payload = await self._request_json(hass, source, "GET", "api/exports")
        if not isinstance(payload, list):
            raise HomeAssistantError("Frigate returned invalid export data")
        records = [
            record
            for raw in payload
            if (record := _normalize_export(raw, source.camera_name)) is not None
        ]
        return tuple(sorted(records, key=lambda item: item.created_time, reverse=True))

    async def async_rename_export(
        self, hass: HomeAssistant, entity_id: str, export_id: str, name: str
    ) -> None:
        source = await async_resolve_source(hass, entity_id)
        await self._validate_export(hass, source, export_id)
        await self._request_json(
            hass,
            source,
            "PATCH",
            f"api/export/{export_id}/rename",
            json_body={"name": name},
        )

    async def async_delete_export(
        self, hass: HomeAssistant, entity_id: str, export_id: str
    ) -> None:
        source = await async_resolve_source(hass, entity_id)
        await self._validate_export(hass, source, export_id)
        response = await self._request(
            hass,
            source,
            "POST",
            "api/exports/delete",
            json_body={"ids": [export_id]},
            accepted_errors={404, 405},
        )
        if response.status in {404, 405}:
            response.release()
            await self._request_json(
                hass,
                source,
                "DELETE",
                f"api/export/{export_id}",
            )
            return
        await _consume_json(response)

    async def async_resolve_export_media(
        self,
        hass: HomeAssistant,
        entity_id: str,
        export_id: str,
        kind: ExportMediaKind,
    ) -> ExportMediaResource:
        source = await async_resolve_source(hass, entity_id)
        raw = await self._validate_export(hass, source, export_id)
        path_key = "thumb_path" if kind == "thumbnail" else "video_path"
        media_path = raw.get(path_key)
        if not isinstance(media_path, str) or not media_path:
            raise HomeAssistantError("Frigate export media is unavailable")
        source_filename = PurePosixPath(media_path).name
        if not source_filename or source_filename in {".", ".."}:
            raise HomeAssistantError("Frigate returned an invalid export path")
        root = "clips/export" if kind == "thumbnail" else "exports"
        headers = await source.client.get_auth_headers()
        title = raw.get("name")
        download_title = (
            title.replace("/", "-").replace("\\", "-").strip()
            if isinstance(title, str)
            else ""
        )
        filename = (
            source_filename
            if kind == "thumbnail" or not download_title
            else (
                download_title
                if download_title.lower().endswith(".mp4")
                else f"{download_title}.mp4"
            )
        )
        return ExportMediaResource(
            url=str(_url(source.base_url, f"{root}/{source_filename}")),
            headers=headers,
            content_type=("image/webp" if kind == "thumbnail" else "video/mp4"),
            filename=filename,
        )

    async def _validate_export(
        self, hass: HomeAssistant, source: FrigateSource, export_id: str
    ) -> dict[str, Any]:
        payload = await self._request_json(
            hass,
            source,
            "GET",
            f"api/exports/{export_id}",
        )
        if not isinstance(payload, dict) or payload.get("id") != export_id:
            raise HomeAssistantError("Frigate returned invalid export data")
        if payload.get("camera") != source.camera_name:
            raise HomeAssistantError("Export does not belong to this camera")
        return payload

    async def _request_json(
        self,
        hass: HomeAssistant,
        source: FrigateSource,
        method: str,
        path: str,
        *,
        json_body: object | None = None,
    ) -> object:
        response = await self._request(hass, source, method, path, json_body=json_body)
        return await _consume_json(response)

    async def _request(
        self,
        hass: HomeAssistant,
        source: FrigateSource,
        method: str,
        path: str,
        *,
        json_body: object | None = None,
        accepted_errors: set[int] | None = None,
    ) -> ClientResponse:
        session: ClientSession = async_get_clientsession(hass)
        headers = await source.client.get_auth_headers()
        response: ClientResponse | None = None
        try:
            response = await session.request(
                method,
                _url(source.base_url, path),
                headers=headers,
                json=json_body,
                ssl=source.client.validate_ssl,
                timeout=_REQUEST_TIMEOUT,
            )
            if response.status not in (accepted_errors or set()):
                response.raise_for_status()
            return response
        except (ClientError, TimeoutError) as err:
            if response is not None:
                response.release()
            raise HomeAssistantError("Unable to access Frigate exports") from err


async def _consume_json(response: ClientResponse) -> object:
    try:
        return await response.json()
    except (ClientError, ValueError) as err:
        raise HomeAssistantError("Frigate returned invalid export data") from err
    finally:
        response.release()


def _normalize_export(raw: object, camera: str) -> ExportRecord | None:
    if not isinstance(raw, dict) or raw.get("camera") != camera:
        return None
    export_id = raw.get("id")
    name = raw.get("name")
    created = raw.get("date")
    in_progress = raw.get("in_progress")
    if (
        not isinstance(export_id, str)
        or not export_id
        or not isinstance(name, str)
        or not name
        or isinstance(created, bool)
        or not isinstance(created, (int, float))
        or not isinstance(in_progress, bool)
    ):
        return None
    material = json.dumps(raw, sort_keys=True, separators=(",", ":"), default=str)
    return ExportRecord(
        id=export_id,
        camera=camera,
        name=name,
        created_time=float(created),
        in_progress=in_progress,
        revision=hashlib.sha256(material.encode()).hexdigest()[:16],
    )


exports: ExportsProvider = FrigateExportsProvider()


def _url(base_url: str, path: str) -> URL:
    url = URL(base_url)
    for segment in path.split("/"):
        url = url / segment
    return url
