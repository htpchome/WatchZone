"""Provider-owned browser live-source descriptions."""

from dataclasses import dataclass
from typing import Protocol

from homeassistant.core import HomeAssistant


@dataclass(frozen=True, slots=True)
class BrowserLiveSource:
    """Non-secret identity and HA-proxied route for one browser source."""

    provider_id: str
    provider_instance_id: str
    stream_id: str
    websocket_path: str


class BrowserLiveSourceProvider(Protocol):
    """Resolve browser transport without leaking provider response shapes."""

    async def async_resolve(
        self, hass: HomeAssistant, entity_id: str
    ) -> BrowserLiveSource:
        """Resolve a provider-owned source for one readable HA entity."""
