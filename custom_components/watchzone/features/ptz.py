"""Provider-resolved PTZ capability and motion lifecycle."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from ..extensions import ProviderRegistry
from ..providers.ptz import PtzCapabilities, PtzDirection, PtzProvider


@dataclass(frozen=True, slots=True)
class PtzMotion:
    """Identity for one active continuous-or-step motion request."""

    entity_id: str
    generation: int


@dataclass(slots=True)
class _ActiveMotion:
    context: Context
    generation: int
    provider: PtzProvider


class PtzService:
    """Serialize motion per camera and make stale cleanup harmless."""

    def __init__(self, hass: HomeAssistant, providers: ProviderRegistry) -> None:
        self._hass = hass
        self._providers = providers
        self._active: dict[str, _ActiveMotion] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._generation = 0

    async def async_capabilities(
        self, provider_id: str, entity_id: str
    ) -> PtzCapabilities:
        """Resolve normalized capabilities through the selected provider."""
        provider = self._provider(provider_id)
        return await provider.async_capabilities(self._hass, entity_id)

    async def async_start(
        self,
        provider_id: str,
        entity_id: str,
        direction: PtzDirection,
        context: Context,
    ) -> PtzMotion:
        """Replace any prior camera movement, then start this request."""
        provider = self._provider(provider_id)
        lock = self._locks.setdefault(entity_id, asyncio.Lock())
        async with lock:
            previous = self._active.pop(entity_id, None)
            if previous:
                await previous.provider.async_stop(
                    self._hass, entity_id, previous.context
                )
            await provider.async_start(self._hass, entity_id, direction, context)
            self._generation += 1
            motion = _ActiveMotion(context, self._generation, provider)
            self._active[entity_id] = motion
            return PtzMotion(entity_id, motion.generation)

    async def async_stop(self, motion: PtzMotion) -> None:
        """Stop only if the supplied motion still owns the camera."""
        lock = self._locks.setdefault(motion.entity_id, asyncio.Lock())
        async with lock:
            active = self._active.get(motion.entity_id)
            if active is None or active.generation != motion.generation:
                return
            try:
                await active.provider.async_stop(
                    self._hass, motion.entity_id, active.context
                )
            finally:
                if self._active.get(motion.entity_id) is active:
                    self._active.pop(motion.entity_id, None)

    async def async_close(self) -> None:
        """Stop every integration-owned motion during unload."""
        active = list(self._active.items())
        self._active.clear()
        await asyncio.gather(
            *(
                motion.provider.async_stop(self._hass, entity_id, motion.context)
                for entity_id, motion in active
            ),
            return_exceptions=True,
        )

    def _provider(self, provider_id: str) -> PtzProvider:
        provider = self._providers.ptz(provider_id)
        if provider is None:
            raise HomeAssistantError("PTZ is unavailable for this connection provider")
        return provider
