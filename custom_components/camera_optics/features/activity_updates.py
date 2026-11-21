"""Provider-resolved real-time activity updates."""

from __future__ import annotations

from asyncio import Lock, TimerHandle
from dataclasses import dataclass, field
from typing import Final

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er

from ..extensions import ProviderRegistry
from ..providers.activity_updates import (
    ActivityUpdateCallback,
    ActivityUpdateKind,
    ActivityUpdateNotification,
    ActivityUpdateUnsubscribe,
)

_IDLE_CHANNEL_RETENTION_SECONDS: Final = 60.0
_ACTIVE_CHANNEL_RETENTION_SECONDS: Final = 60 * 60.0


@dataclass(slots=True)
class _ActivityChannel:
    """One shared provider subscription and its bounded replay state."""

    callbacks: set[ActivityUpdateCallback] = field(default_factory=set)
    active_reviews: dict[str, ActivityUpdateNotification] = field(default_factory=dict)
    release_timer: TimerHandle | None = None
    unsubscribe: ActivityUpdateUnsubscribe | None = None


class ActivityUpdatesService:
    """Own provider resolution for normalized activity subscriptions."""

    def __init__(self, hass: HomeAssistant, providers: ProviderRegistry) -> None:
        self._hass = hass
        self._providers = providers
        self._channels: dict[tuple[str, ActivityUpdateKind], _ActivityChannel] = {}
        self._lock = Lock()

    async def async_subscribe(
        self,
        entity_id: str,
        kind: ActivityUpdateKind,
        callback: ActivityUpdateCallback,
    ) -> ActivityUpdateUnsubscribe:
        """Subscribe through the camera entity's owning provider."""
        key = (entity_id, kind)
        async with self._lock:
            channel = self._channels.get(key)
            if channel is None:
                entry = er.async_get(self._hass).async_get(entity_id)
                provider = (
                    self._providers.activity_updates(entry.platform) if entry else None
                )
                if provider is None:
                    raise HomeAssistantError(
                        "Real-time activity is unavailable for this camera"
                    )
                channel = _ActivityChannel()
                self._channels[key] = channel

                def receive(notification: ActivityUpdateNotification) -> None:
                    self._receive(key, channel, notification)

                try:
                    channel.unsubscribe = (
                        await provider.async_subscribe_activity_updates(
                            self._hass, entity_id, kind, receive
                        )
                    )
                except BaseException:
                    self._channels.pop(key, None)
                    raise
            elif channel.release_timer is not None:
                channel.release_timer.cancel()
                channel.release_timer = None

            channel.callbacks.add(callback)
            if kind == "reviews":
                if channel.active_reviews:
                    self._hass.loop.call_soon(self._replay, channel, callback)

        released = False

        def release() -> None:
            nonlocal released
            if released:
                return
            released = True
            self._release(key, channel, callback)

        return release

    @staticmethod
    def _replay(
        channel: _ActivityChannel,
        callback: ActivityUpdateCallback,
    ) -> None:
        """Replay after WebSocket subscription setup has completed."""
        if callback not in channel.callbacks:
            return
        for notification in channel.active_reviews.values():
            callback(notification)

    def _receive(
        self,
        key: tuple[str, ActivityUpdateKind],
        channel: _ActivityChannel,
        notification: ActivityUpdateNotification,
    ) -> None:
        """Update replay state once and fan out one provider notification."""
        had_active_reviews = bool(channel.active_reviews)
        if notification.topic == "reviews" and notification.id:
            if notification.phase == "end":
                channel.active_reviews.pop(notification.id, None)
            elif notification.classification is not None:
                channel.active_reviews[notification.id] = notification
        for callback in tuple(channel.callbacks):
            callback(notification)
        if not channel.callbacks and had_active_reviews != bool(channel.active_reviews):
            self._schedule_expiry(key, channel)

    def _release(
        self,
        key: tuple[str, ActivityUpdateKind],
        channel: _ActivityChannel,
        callback: ActivityUpdateCallback,
    ) -> None:
        """Retain an idle channel briefly across dashboard replacement."""
        if self._channels.get(key) is not channel:
            return
        channel.callbacks.discard(callback)
        if channel.callbacks:
            return
        self._schedule_expiry(key, channel)

    def _schedule_expiry(
        self,
        key: tuple[str, ActivityUpdateKind],
        channel: _ActivityChannel,
    ) -> None:
        """Bound idle work while allowing an ongoing Review to finish."""
        if channel.release_timer is not None:
            channel.release_timer.cancel()
        retention = (
            _ACTIVE_CHANNEL_RETENTION_SECONDS
            if channel.active_reviews
            else _IDLE_CHANNEL_RETENTION_SECONDS
        )
        if self._channels.get(key) is not channel:
            channel.release_timer = None
            return
        channel.release_timer = self._hass.loop.call_later(
            retention,
            self._expire,
            key,
            channel,
        )

    def _expire(
        self,
        key: tuple[str, ActivityUpdateKind],
        channel: _ActivityChannel,
    ) -> None:
        """Release one channel after its bounded navigation grace period."""
        if self._channels.get(key) is not channel or channel.callbacks:
            return
        self._channels.pop(key, None)
        channel.release_timer = None
        channel.active_reviews.clear()
        if channel.unsubscribe is not None:
            channel.unsubscribe()
            channel.unsubscribe = None

    async def async_close(self) -> None:
        """Release every provider subscription owned by the runtime."""
        async with self._lock:
            channels = tuple(self._channels.values())
            self._channels.clear()
        for channel in channels:
            if channel.release_timer is not None:
                channel.release_timer.cancel()
                channel.release_timer = None
            channel.callbacks.clear()
            channel.active_reviews.clear()
            if channel.unsubscribe is not None:
                channel.unsubscribe()
                channel.unsubscribe = None
