"""Shared real-time activity update subscriptions."""

from __future__ import annotations

import asyncio
from collections.abc import Callable

from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er

from ..extensions import ProviderRegistry
from ..providers.activity_updates import ActivityUpdateKind

type ActivitySubscriptionKey = tuple[str, ActivityUpdateKind]


class ActivityUpdatesService:
    """Share one provider activity subscription across frontend consumers."""

    def __init__(self, hass: HomeAssistant, providers: ProviderRegistry) -> None:
        self._hass = hass
        self._providers = providers
        self._listeners: dict[ActivitySubscriptionKey, set[Callable[[], None]]] = {}
        self._provider_unsubscribes: dict[
            ActivitySubscriptionKey, Callable[[], None]
        ] = {}
        self._locks: dict[ActivitySubscriptionKey, asyncio.Lock] = {}

    async def async_subscribe(
        self,
        entity_id: str,
        kind: ActivityUpdateKind,
        listener: Callable[[], None],
    ) -> Callable[[], None]:
        """Subscribe to one camera's provider activity notifications."""
        entry = er.async_get(self._hass).async_get(entity_id)
        provider = self._providers.activity_updates(entry.platform) if entry else None
        if provider is None:
            raise HomeAssistantError(
                "Real-time activity is unavailable for this camera"
            )
        key = (entity_id, kind)
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            listeners = self._listeners.setdefault(key, set())
            listeners.add(listener)
            if key not in self._provider_unsubscribes:
                try:
                    self._provider_unsubscribes[key] = (
                        await provider.async_subscribe_activity_updates(
                            self._hass,
                            entity_id,
                            kind,
                            lambda: self._notify(key),
                        )
                    )
                except HomeAssistantError:
                    listeners.discard(listener)
                    if not listeners:
                        self._listeners.pop(key, None)
                        self._locks.pop(key, None)
                    raise
                except Exception as err:
                    listeners.discard(listener)
                    if not listeners:
                        self._listeners.pop(key, None)
                        self._locks.pop(key, None)
                    raise HomeAssistantError(
                        "Unable to subscribe to camera activity"
                    ) from err

        unsubscribed = False

        @callback
        def unsubscribe() -> None:
            nonlocal unsubscribed
            if unsubscribed:
                return
            unsubscribed = True
            listeners = self._listeners.get(key)
            if listeners is None:
                return
            listeners.discard(listener)
            if listeners:
                return
            self._listeners.pop(key, None)
            self._locks.pop(key, None)
            self._provider_unsubscribes.pop(key, lambda: None)()

        return unsubscribe

    async def async_close(self) -> None:
        """Release provider subscriptions."""
        unsubscribes = list(self._provider_unsubscribes.values())
        self._provider_unsubscribes.clear()
        self._listeners.clear()
        self._locks.clear()
        for unsubscribe in unsubscribes:
            unsubscribe()

    @callback
    def _notify(self, key: ActivitySubscriptionKey) -> None:
        for listener in tuple(self._listeners.get(key, ())):
            listener()
