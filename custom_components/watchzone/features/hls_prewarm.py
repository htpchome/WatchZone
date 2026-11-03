"""Lifecycle-owned Home Assistant HLS pre-warming."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Protocol, cast

from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CoreState, Event, HomeAssistant, callback
from homeassistant.helpers.event import (
    EventStateChangedData,
    async_track_state_change_event,
)

from ..const import MAX_HLS_PREWARM_CAMERAS, NAME

_HLS_PROVIDER = "hls"
_LOGGER = logging.getLogger(__name__)


class _DynamicStreamSettings(Protocol):
    """Minimum mutable HA stream setting used by this feature."""

    preload_stream: bool


class _StreamOutput(Protocol):
    """Minimum HA output contract needed for safe release."""

    @property
    def idle(self) -> bool:
        """Return whether the output has no active consumer."""


class _Stream(Protocol):
    """Minimum Home Assistant stream contract used for pre-warming."""

    dynamic_stream_settings: _DynamicStreamSettings

    def add_provider(self, fmt: str, timeout: int | None = None) -> _StreamOutput:
        """Add or reuse one output provider."""

    def outputs(self) -> Mapping[str, _StreamOutput]:
        """Return current output providers."""

    async def remove_provider(self, provider: _StreamOutput) -> None:
        """Remove an idle output provider."""

    async def start(self) -> None:
        """Start the shared camera stream worker."""


class _Camera(Protocol):
    """Minimum Home Assistant camera contract used for pre-warming."""

    async def async_create_stream(self) -> _Stream | None:
        """Create or reuse the entity's single stream worker."""


@dataclass(slots=True)
class _ManagedStream:
    original_preload: bool
    stream: _Stream


@dataclass(frozen=True, slots=True)
class HlsPrewarmStatus:
    """Sanitized diagnostic state for one selected camera."""

    entity_id: str
    state: str


def _normalize_entities(entity_ids: object) -> tuple[str, ...]:
    """Return one bounded, ordered set of camera entity IDs."""
    if not isinstance(entity_ids, list | tuple):
        return ()
    normalized: list[str] = []
    for value in entity_ids:
        if (
            isinstance(value, str)
            and value.startswith("camera.")
            and value not in normalized
        ):
            normalized.append(value)
        if len(normalized) == MAX_HLS_PREWARM_CAMERAS:
            break
    return tuple(normalized)


class HlsPrewarmService:
    """Own selected-camera HLS keepalive state for one config entry."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._selected: tuple[str, ...] = ()
        self._managed: dict[str, _ManagedStream] = {}
        self._states: dict[str, str] = {}
        self._state_unsub: Callable[[], None] | None = None
        self._started_unsub: Callable[[], None] | None = None
        self._reconcile_task: asyncio.Task[None] | None = None
        self._reconcile_requested = False
        self._failure_reported: set[str] = set()
        self._closed = False

    async def async_setup(self, entity_ids: object) -> None:
        """Configure the allowlist and start when Home Assistant is ready."""
        self._selected = _normalize_entities(entity_ids)
        self._replace_state_listener()
        if self._hass.state is CoreState.running:
            self._schedule_reconcile()
            return
        self._started_unsub = self._hass.bus.async_listen_once(
            EVENT_HOMEASSISTANT_STARTED, self._handle_home_assistant_started
        )

    async def async_set_entities(self, entity_ids: object) -> None:
        """Apply a changed explicit allowlist without reloading the integration."""
        selected = _normalize_entities(entity_ids)
        if selected == self._selected:
            return
        removed = tuple(
            entity_id for entity_id in self._selected if entity_id not in selected
        )
        self._selected = selected
        self._replace_state_listener()
        await self._cancel_reconcile()
        for entity_id in removed:
            await self._async_release(entity_id)
            self._states.pop(entity_id, None)
            self._failure_reported.discard(entity_id)
        if self._hass.state is CoreState.running:
            self._schedule_reconcile()

    def diagnostics(self) -> tuple[HlsPrewarmStatus, ...]:
        """Return bounded, credential-free status in configured order."""
        return tuple(
            HlsPrewarmStatus(entity_id, self._states.get(entity_id, "pending"))
            for entity_id in self._selected
        )

    async def async_close(self) -> None:
        """Stop work and restore only keepalive state enabled by WatchZone."""
        self._closed = True
        if self._started_unsub is not None:
            self._started_unsub()
            self._started_unsub = None
        if self._state_unsub is not None:
            self._state_unsub()
            self._state_unsub = None
        await self._cancel_reconcile()
        for entity_id in tuple(self._managed):
            await self._async_release(entity_id)
        self._states.clear()
        self._failure_reported.clear()

    @callback
    def _handle_home_assistant_started(self, _event: Event) -> None:
        self._started_unsub = None
        self._schedule_reconcile()

    @callback
    def _handle_camera_state_change(self, _event: Event[EventStateChangedData]) -> None:
        entity_id = _event.data["entity_id"]
        if self._states.get(entity_id) in {"warm", "warming"}:
            return
        self._schedule_reconcile()

    @callback
    def _replace_state_listener(self) -> None:
        if self._state_unsub is not None:
            self._state_unsub()
            self._state_unsub = None
        if self._selected:
            self._state_unsub = async_track_state_change_event(
                self._hass, self._selected, self._handle_camera_state_change
            )

    @callback
    def _schedule_reconcile(self) -> None:
        if self._closed:
            return
        if self._reconcile_task is not None and not self._reconcile_task.done():
            self._reconcile_requested = True
            return
        self._reconcile_task = self._hass.async_create_task(
            self._async_reconcile(), f"{NAME} pre-warm selected HLS streams"
        )

    async def _cancel_reconcile(self) -> None:
        task = self._reconcile_task
        self._reconcile_task = None
        self._reconcile_requested = False
        if task is None or task.done():
            return
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    async def _async_reconcile(self) -> None:
        """Warm selected cameras sequentially in explicit user order."""
        try:
            for entity_id in self._selected:
                if self._closed:
                    return
                if entity_id in self._managed:
                    self._states[entity_id] = "warm"
                    continue
                self._states[entity_id] = "warming"
                try:
                    await self._async_warm(entity_id)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    self._states[entity_id] = "failed"
                    if entity_id not in self._failure_reported:
                        _LOGGER.warning(
                            "Unable to pre-warm HLS for %s", entity_id, exc_info=True
                        )
                        self._failure_reported.add(entity_id)
                else:
                    self._states[entity_id] = "warm"
                    self._failure_reported.discard(entity_id)
        finally:
            if self._reconcile_task is asyncio.current_task():
                rerun = self._reconcile_requested
                self._reconcile_requested = False
                self._reconcile_task = None
                if rerun:
                    self._schedule_reconcile()

    async def _async_warm(self, entity_id: str) -> None:
        camera = self._camera(entity_id)
        stream = await camera.async_create_stream()
        if stream is None:
            raise RuntimeError("Camera does not expose an HLS stream source")
        settings = stream.dynamic_stream_settings
        managed = _ManagedStream(settings.preload_stream, stream)
        self._managed[entity_id] = managed
        settings.preload_stream = True
        try:
            stream.add_provider(_HLS_PROVIDER)
            await stream.start()
        except asyncio.CancelledError:
            await self._async_release(entity_id)
            raise
        except Exception:
            await self._async_release(entity_id)
            raise

    async def _async_release(self, entity_id: str) -> None:
        managed = self._managed.pop(entity_id, None)
        if managed is None:
            return
        managed.stream.dynamic_stream_settings.preload_stream = managed.original_preload
        if managed.original_preload:
            return
        provider = managed.stream.outputs().get(_HLS_PROVIDER)
        if provider is not None and provider.idle:
            await managed.stream.remove_provider(provider)

    def _camera(self, entity_id: str) -> _Camera:
        """Resolve through HA lazily so integration import stays lightweight."""
        from homeassistant.components.camera.helper import get_camera_from_entity_id

        return cast(_Camera, get_camera_from_entity_id(self._hass, entity_id))
