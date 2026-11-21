"""Provider-neutral camera runtime capability contracts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from homeassistant.core import Context, HomeAssistant


@dataclass(frozen=True, slots=True)
class CameraRuntimeState:
    """Normalized provider camera runtime state."""

    available: bool
    provider: str
    supported: bool
    suspended: bool


class CameraRuntimeProvider(Protocol):
    """Narrow capability implemented by a concrete provider adapter."""

    async def async_get_state(
        self, hass: HomeAssistant, entity_id: str
    ) -> CameraRuntimeState:
        """Return normalized provider truth for one camera."""

    async def async_set_suspended(
        self,
        hass: HomeAssistant,
        entity_id: str,
        suspended: bool,
        context: Context | None,
    ) -> None:
        """Set the provider camera's actual runtime state."""
