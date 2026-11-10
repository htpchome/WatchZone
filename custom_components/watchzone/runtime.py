"""Runtime state for a configured WatchZone entry."""

from dataclasses import dataclass

from .features.activity_updates import ActivityUpdatesService
from .features.camera_runtime import CameraRuntimeService
from .features.events import EventsService
from .features.hls_prewarm import HlsPrewarmService
from .features.layouts import StageDesignStore
from .features.live import LiveSignalingService
from .features.ptz import PtzService
from .features.recordings import RecordingsService
from .features.reviews import ReviewsService


@dataclass(slots=True)
class WatchZoneRuntime:
    """Runtime state owned by one WatchZone config entry."""

    entry_id: str
    activity_updates: ActivityUpdatesService
    camera_runtime: CameraRuntimeService
    hls_prewarm: HlsPrewarmService
    live_signaling: LiveSignalingService
    stage_designs: StageDesignStore
    ptz: PtzService
    recordings: RecordingsService
    events: EventsService
    reviews: ReviewsService

    async def async_close(self) -> None:
        """Release integration-owned runtime resources."""
        await self.camera_runtime.async_close()
        await self.hls_prewarm.async_close()
        await self.live_signaling.async_close()
        await self.ptz.async_close()
        await self.recordings.async_close()
        await self.events.async_close()
        await self.reviews.async_close()
