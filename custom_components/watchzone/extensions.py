"""Stable backend extension contracts and provider capability registry."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .providers.activity_updates import ActivityUpdatesProvider
from .providers.camera import CameraRuntimeProvider, CameraRuntimeState
from .providers.events import EventsProvider
from .providers.live import (
    LiveSignalingProvider,
    LiveSignalingSession,
    ProviderPreparationError,
    SendLiveSignalingEvent,
)
from .providers.ptz import PtzProvider
from .providers.reviews import ReviewsProvider

__all__ = [
    "EXTENSION_API_VERSION",
    "ActivityUpdatesProvider",
    "CameraRuntimeProvider",
    "CameraRuntimeState",
    "EventsProvider",
    "LiveSignalingProvider",
    "LiveSignalingSession",
    "ProviderExtension",
    "ProviderPreparationError",
    "PtzProvider",
    "ReviewsProvider",
    "SendLiveSignalingEvent",
    "register_provider_extension",
]

EXTENSION_API_VERSION = 2
_DATA_PROVIDER_REGISTRY = "provider_registry"


@dataclass(frozen=True, slots=True)
class ProviderExtension:
    """One provider's optional, independently resolvable capabilities."""

    api_version: int
    provider_id: str
    entity_platforms: frozenset[str]
    camera_runtime: CameraRuntimeProvider | None = None
    camera_runtime_poll_interval: float | None = None
    activity_updates: ActivityUpdatesProvider | None = None
    live_signaling: LiveSignalingProvider | None = None
    talk_signaling: LiveSignalingProvider | None = None
    ptz: PtzProvider | None = None
    events: EventsProvider | None = None
    reviews: ReviewsProvider | None = None


class ProviderRegistry:
    """Resolve provider capabilities without importing concrete adapters in features."""

    def __init__(self) -> None:
        self._providers: dict[str, ProviderExtension] = {}
        self._platforms: dict[str, ProviderExtension] = {}

    def register(self, extension: ProviderExtension) -> Callable[[], None]:
        """Register one provider extension and return idempotent cleanup."""
        self._validate(extension)
        if extension.provider_id in self._providers:
            raise ValueError(
                f"Provider extension '{extension.provider_id}' is already registered"
            )
        conflicts = extension.entity_platforms & self._platforms.keys()
        if conflicts:
            platforms = ", ".join(sorted(conflicts))
            raise ValueError(f"Entity platform already registered: {platforms}")

        self._providers[extension.provider_id] = extension
        for platform in extension.entity_platforms:
            self._platforms[platform] = extension

        @callback
        def unregister() -> None:
            if self._providers.get(extension.provider_id) is not extension:
                return
            self._providers.pop(extension.provider_id, None)
            for platform in extension.entity_platforms:
                if self._platforms.get(platform) is extension:
                    self._platforms.pop(platform, None)

        return unregister

    def camera_runtime(self, platform: str) -> CameraRuntimeProvider | None:
        """Resolve one platform's optional camera-runtime capability."""
        extension = self._platforms.get(platform)
        return extension.camera_runtime if extension else None

    def activity_updates(self, platform: str) -> ActivityUpdatesProvider | None:
        """Resolve one platform's optional real-time activity capability."""
        extension = self._platforms.get(platform)
        return extension.activity_updates if extension else None

    def camera_runtime_poll_interval(self, platform: str) -> float | None:
        """Return the declared monitor interval for camera-runtime truth."""
        extension = self._platforms.get(platform)
        if extension is None:
            return None
        return extension.camera_runtime_poll_interval

    def live_signaling(self, platform: str) -> LiveSignalingProvider | None:
        """Resolve one platform's optional live-signaling capability."""
        extension = self._platforms.get(platform)
        return extension.live_signaling if extension else None

    def live_signaling_provider(
        self, provider_id: str
    ) -> LiveSignalingProvider | None:
        """Resolve live signaling by explicit connection-provider identity."""
        extension = self._providers.get(provider_id)
        return extension.live_signaling if extension else None

    def talk_signaling(self, platform: str) -> LiveSignalingProvider | None:
        """Resolve one platform's optional talk-signaling capability."""
        extension = self._platforms.get(platform)
        return extension.talk_signaling if extension else None

    def talk_signaling_provider(
        self, provider_id: str
    ) -> LiveSignalingProvider | None:
        """Resolve talk signaling by explicit connection-provider identity."""
        extension = self._providers.get(provider_id)
        return extension.talk_signaling if extension else None

    def ptz(self, provider_id: str) -> PtzProvider | None:
        """Resolve PTZ by explicit connection-provider identity."""
        extension = self._providers.get(provider_id)
        return extension.ptz if extension else None

    def events(self, platform: str) -> EventsProvider | None:
        """Resolve one platform's optional event capability."""
        extension = self._platforms.get(platform)
        return extension.events if extension else None

    def reviews(self, platform: str) -> ReviewsProvider | None:
        """Resolve one platform's optional review capability."""
        extension = self._platforms.get(platform)
        return extension.reviews if extension else None

    @staticmethod
    def _validate(extension: ProviderExtension) -> None:
        if extension.api_version != EXTENSION_API_VERSION:
            raise ValueError(
                "Unsupported provider extension API version: "
                f"{extension.api_version}"
            )
        if not extension.provider_id.strip():
            raise ValueError("Provider extension ID must not be empty")
        if any(
            not platform.strip() for platform in extension.entity_platforms
        ):
            raise ValueError("Provider entity platforms must not be empty strings")
        if not extension.entity_platforms and extension.ptz is None:
            raise ValueError(
                "Provider extension must declare entity platforms or PTZ"
            )
        interval = extension.camera_runtime_poll_interval
        if interval is not None and (
            isinstance(interval, bool) or interval <= 0
        ):
            raise ValueError("Camera runtime poll interval must be positive")
        if interval is not None and extension.camera_runtime is None:
            raise ValueError(
                "Camera runtime polling requires a camera-runtime capability"
            )


def get_provider_registry(hass: HomeAssistant) -> ProviderRegistry:
    """Return the domain registry, creating the provider-neutral store once."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    registry = domain_data.get(_DATA_PROVIDER_REGISTRY)
    if isinstance(registry, ProviderRegistry):
        return registry
    registry = ProviderRegistry()
    domain_data[_DATA_PROVIDER_REGISTRY] = registry
    return registry


def register_provider_extension(
    hass: HomeAssistant, extension: ProviderExtension
) -> Callable[[], None]:
    """Public entry point for a companion integration to register a provider."""
    return get_provider_registry(hass).register(extension)
