"""Provider-neutral PTZ capability contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from homeassistant.core import Context, HomeAssistant

type PtzDirection = Literal["down", "left", "right", "up"]


@dataclass(frozen=True, slots=True)
class PtzCapabilities:
    """Normalized optical PTZ capabilities for one camera."""

    pan: bool = False
    tilt: bool = False
    zoom: bool = False
    focus: bool = False
    presets: tuple[str, ...] = ()

    @property
    def directional(self) -> bool:
        """Return whether the initial directional presentation is usable."""
        return self.pan or self.tilt


class PtzProvider(Protocol):
    """One provider's normalized PTZ operations."""

    async def async_capabilities(
        self, hass: HomeAssistant, entity_id: str
    ) -> PtzCapabilities:
        """Return truthful capabilities for one camera."""

    async def async_start(
        self,
        hass: HomeAssistant,
        entity_id: str,
        direction: PtzDirection,
        context: Context,
    ) -> None:
        """Start or perform one directional movement."""

    async def async_stop(
        self, hass: HomeAssistant, entity_id: str, context: Context
    ) -> None:
        """Stop movement when the selected HA surface supports it."""
