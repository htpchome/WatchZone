"""Runtime state for a configured WatchZone entry."""

from dataclasses import dataclass

from .features.live import LiveSignalingService


@dataclass(slots=True)
class WatchZoneRuntime:
    """Runtime state owned by one WatchZone config entry."""

    entry_id: str
    live_signaling: LiveSignalingService

    async def async_close(self) -> None:
        """Release integration-owned runtime resources."""
        await self.live_signaling.async_close()
