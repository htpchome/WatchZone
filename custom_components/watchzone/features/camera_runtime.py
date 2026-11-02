"""Provider-resolved camera suspension and durable resume scheduling."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from importlib import import_module
from typing import Protocol, cast

from homeassistant.core import Context, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import (
    async_track_point_in_utc_time,
    async_track_state_change_event,
)
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..const import DOMAIN, NAME
from ..providers.camera import CameraRuntimeState

_STORAGE_KEY = f"{DOMAIN}.camera_suspensions"
_STORAGE_VERSION = 1
_STATE_CONFIRMATION_TIMEOUT = 12.0
_RESUME_RETRY_DELAY = timedelta(minutes=1)
_LOGGER = logging.getLogger(__name__)


class _ProviderModule(Protocol):
    async def async_get_state(
        self, hass: HomeAssistant, entity_id: str
    ) -> CameraRuntimeState:
        """Return normalized provider truth."""

    async def async_set_suspended(
        self,
        hass: HomeAssistant,
        entity_id: str,
        suspended: bool,
        context: Context | None,
    ) -> None:
        """Set provider camera runtime state."""


@dataclass(frozen=True, slots=True)
class CameraRuntimeSnapshot:
    """Frontend-safe camera runtime snapshot."""

    available: bool
    entity_id: str
    provider: str | None
    resume_at: str | None
    supported: bool
    suspended: bool


@dataclass(frozen=True, slots=True)
class _ResumeSchedule:
    resume_at: datetime | None


class CameraRuntimeService:
    """Own provider commands and optional backend resume schedules."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store = Store[dict[str, object]](
            hass, _STORAGE_VERSION, _STORAGE_KEY, atomic_writes=True
        )
        self._schedules: dict[str, _ResumeSchedule] = {}
        self._timers: dict[str, Callable[[], None]] = {}
        self._state_unsubs: dict[str, Callable[[], None]] = {}
        self._subscriber_state_unsubs: dict[str, Callable[[], None]] = {}
        self._subscribers: dict[
            str, set[Callable[[CameraRuntimeSnapshot], None]]
        ] = {}
        self._reconcile_tasks: dict[str, asyncio.Task[None]] = {}
        self._closed = False

    async def async_setup(self) -> None:
        """Restore persisted resume schedules and reconcile provider truth."""
        stored = await self._store.async_load() or {}
        raw_schedules = stored.get("schedules", stored.get("intents", {}))
        if isinstance(raw_schedules, dict):
            for entity_id, raw in raw_schedules.items():
                if not isinstance(entity_id, str) or not isinstance(raw, dict):
                    continue
                raw_resume_at = raw.get("resume_at")
                resume_at = (
                    dt_util.parse_datetime(raw_resume_at)
                    if isinstance(raw_resume_at, str)
                    else None
                )
                if isinstance(raw_resume_at, str) and resume_at is None:
                    continue
                if resume_at is not None:
                    resume_at = dt_util.as_utc(resume_at)
                if resume_at is None:
                    continue
                self._schedules[entity_id] = _ResumeSchedule(resume_at)
                self._watch_entity(entity_id)
                self._schedule(entity_id)
        results = await asyncio.gather(
            *(self._async_reconcile(entity_id) for entity_id in self._schedules),
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, BaseException):
                _LOGGER.warning(
                    "Unable to restore a camera resume schedule: %s", result
                )

    async def async_snapshot(self, entity_id: str) -> CameraRuntimeSnapshot:
        """Return provider truth plus the backend-owned resume deadline."""
        provider = self._provider(entity_id)
        if provider is None:
            return CameraRuntimeSnapshot(
                available=self._hass.states.get(entity_id) is not None,
                entity_id=entity_id,
                provider=None,
                resume_at=None,
                supported=False,
                suspended=False,
            )
        state = await provider.async_get_state(self._hass, entity_id)
        schedule = self._schedules.get(entity_id)
        return CameraRuntimeSnapshot(
            available=state.available,
            entity_id=entity_id,
            provider=state.provider,
            resume_at=(
                schedule.resume_at.isoformat()
                if schedule and schedule.resume_at
                else None
            ),
            supported=state.supported,
            suspended=state.suspended,
        )

    async def async_set_suspended(
        self,
        entity_id: str,
        suspended: bool,
        resume_after: timedelta | None,
        context: Context | None,
    ) -> CameraRuntimeSnapshot:
        """Apply one command and return only provider-confirmed state."""
        provider = self._provider(entity_id)
        if provider is None:
            raise HomeAssistantError("Camera suspension is not supported")
        state = await provider.async_get_state(self._hass, entity_id)
        if not state.supported:
            raise HomeAssistantError("Camera suspension is not supported")

        if state.suspended != suspended:
            await provider.async_set_suspended(
                self._hass, entity_id, suspended, context
            )
            state = await self._async_wait_for_provider_state(
                provider, entity_id, suspended
            )

        if suspended and resume_after is not None:
            self._schedules[entity_id] = _ResumeSchedule(
                dt_util.utcnow() + resume_after
            )
            self._watch_entity(entity_id)
        else:
            self._remove_schedule(entity_id)

        self._schedule(entity_id)
        await self._save()
        schedule = self._schedules.get(entity_id)
        snapshot = CameraRuntimeSnapshot(
            available=state.available,
            entity_id=entity_id,
            provider=state.provider,
            resume_at=(
                schedule.resume_at.isoformat()
                if schedule and schedule.resume_at
                else None
            ),
            supported=state.supported,
            suspended=state.suspended,
        )
        self._notify_subscribers(entity_id, snapshot)
        return snapshot

    async def _async_wait_for_provider_state(
        self,
        provider: _ProviderModule,
        entity_id: str,
        suspended: bool,
    ) -> CameraRuntimeState:
        """Wait for the provider to report the requested state."""
        changed = asyncio.Event()
        unsubscribe = async_track_state_change_event(
            self._hass, [entity_id], lambda _event: changed.set()
        )
        loop = asyncio.get_running_loop()
        deadline = loop.time() + _STATE_CONFIRMATION_TIMEOUT
        try:
            while True:
                state = await provider.async_get_state(self._hass, entity_id)
                if state.suspended == suspended:
                    return state
                remaining = deadline - loop.time()
                if remaining <= 0:
                    break
                try:
                    await asyncio.wait_for(changed.wait(), timeout=remaining)
                except TimeoutError:
                    break
                changed.clear()
        finally:
            unsubscribe()
        raise HomeAssistantError(
            "The camera provider did not confirm the requested state change"
        )

    def async_subscribe(
        self, entity_id: str, listener: Callable[[CameraRuntimeSnapshot], None]
    ) -> Callable[[], None]:
        """Notify one frontend subscriber when normalized state changes."""
        listeners = self._subscribers.setdefault(entity_id, set())
        listeners.add(listener)
        if entity_id not in self._subscriber_state_unsubs:
            self._subscriber_state_unsubs[entity_id] = async_track_state_change_event(
                self._hass,
                [entity_id],
                lambda _event: self._start_snapshot_notification(entity_id),
            )

        @callback
        def unsubscribe() -> None:
            current = self._subscribers.get(entity_id)
            if current is None:
                return
            current.discard(listener)
            if current:
                return
            self._subscribers.pop(entity_id, None)
            self._subscriber_state_unsubs.pop(entity_id, lambda: None)()

        return unsubscribe

    async def async_close(self) -> None:
        """Cancel timers, listeners, and reconciliation tasks."""
        self._closed = True
        for cancel in self._timers.values():
            cancel()
        self._timers.clear()
        for unsub in self._state_unsubs.values():
            unsub()
        self._state_unsubs.clear()
        for unsub in self._subscriber_state_unsubs.values():
            unsub()
        self._subscriber_state_unsubs.clear()
        self._subscribers.clear()
        tasks = list(self._reconcile_tasks.values())
        self._reconcile_tasks.clear()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    def _provider(self, entity_id: str) -> _ProviderModule | None:
        registry_entry = er.async_get(self._hass).async_get(entity_id)
        if registry_entry is None:
            return None
        try:
            return cast(
                _ProviderModule,
                import_module(
                    f"custom_components.{DOMAIN}.providers."
                    f"{registry_entry.platform}.camera"
                ),
            )
        except ModuleNotFoundError:
            return None

    @callback
    def _watch_entity(self, entity_id: str) -> None:
        if entity_id in self._state_unsubs:
            return
        self._state_unsubs[entity_id] = async_track_state_change_event(
            self._hass,
            [entity_id],
            lambda _event: self._start_reconcile(entity_id),
        )

    @callback
    def _start_reconcile(self, entity_id: str) -> None:
        previous = self._reconcile_tasks.get(entity_id)
        if previous and not previous.done():
            return
        task = self._hass.async_create_task(
            self._async_reconcile(entity_id),
            f"{NAME} reconcile camera suspension for {entity_id}",
        )
        self._reconcile_tasks[entity_id] = task
        task.add_done_callback(
            lambda completed: self._discard_reconcile_task(entity_id, completed)
        )

    @callback
    def _discard_reconcile_task(
        self, entity_id: str, completed: asyncio.Task[None]
    ) -> None:
        if self._reconcile_tasks.get(entity_id) is completed:
            self._reconcile_tasks.pop(entity_id, None)

    async def _async_reconcile(self, entity_id: str) -> None:
        schedule = self._schedules.get(entity_id)
        if schedule is None or self._closed:
            return
        provider = self._provider(entity_id)
        if provider is None:
            return
        state = await provider.async_get_state(self._hass, entity_id)
        if state.available and state.supported and not state.suspended:
            self._remove_schedule(entity_id)
            await self._save()
            await self._async_publish_snapshot(entity_id)
            return
        if (
            state.available
            and state.supported
            and state.suspended
            and schedule.resume_at is not None
            and schedule.resume_at <= dt_util.utcnow()
        ):
            await self._async_resume(entity_id)

    @callback
    def _schedule(self, entity_id: str) -> None:
        self._timers.pop(entity_id, lambda: None)()
        schedule = self._schedules.get(entity_id)
        if schedule is None or schedule.resume_at is None:
            return

        async def resume(_now: datetime) -> None:
            await self._async_resume(entity_id)

        self._timers[entity_id] = async_track_point_in_utc_time(
            self._hass, resume, schedule.resume_at
        )

    async def _async_resume(self, entity_id: str) -> None:
        provider = self._provider(entity_id)
        if provider is None:
            self._schedule_retry(entity_id)
            return
        try:
            await self.async_set_suspended(entity_id, False, None, None)
        except Exception:
            self._schedule_retry(entity_id)

    @callback
    def _schedule_retry(self, entity_id: str) -> None:
        self._timers.pop(entity_id, lambda: None)()

        async def retry(_now: datetime) -> None:
            await self._async_resume(entity_id)

        self._timers[entity_id] = async_track_point_in_utc_time(
            self._hass, retry, dt_util.utcnow() + _RESUME_RETRY_DELAY
        )

    @callback
    def _remove_schedule(self, entity_id: str) -> None:
        self._schedules.pop(entity_id, None)
        self._timers.pop(entity_id, lambda: None)()
        self._state_unsubs.pop(entity_id, lambda: None)()

    async def _save(self) -> None:
        await self._store.async_save(
            {
                "schedules": {
                    entity_id: {
                        "resume_at": (
                            schedule.resume_at.isoformat()
                            if schedule.resume_at
                            else None
                        )
                    }
                    for entity_id, schedule in self._schedules.items()
                }
            }
        )

    @callback
    def _start_snapshot_notification(
        self,
        entity_id: str,
    ) -> None:
        self._hass.async_create_task(
            self._async_publish_snapshot(entity_id),
            f"{NAME} publish camera runtime state for {entity_id}",
        )

    async def _async_publish_snapshot(self, entity_id: str) -> None:
        if entity_id not in self._subscribers:
            return
        self._notify_subscribers(entity_id, await self.async_snapshot(entity_id))

    @callback
    def _notify_subscribers(
        self, entity_id: str, snapshot: CameraRuntimeSnapshot
    ) -> None:
        for listener in tuple(self._subscribers.get(entity_id, ())):
            try:
                listener(snapshot)
            except Exception:
                _LOGGER.exception(
                    "Unable to publish camera runtime state for %s", entity_id
                )


def snapshot_dict(snapshot: CameraRuntimeSnapshot) -> dict[str, object]:
    """Serialize a normalized snapshot for the WebSocket boundary."""
    return asdict(snapshot)
