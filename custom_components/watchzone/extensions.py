"""Stable backend extension contracts and provider capability registry."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from importlib import import_module
from typing import cast

from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .providers.camera import CameraRuntimeProvider, CameraRuntimeState
from .providers.live import (
    LiveSignalingProvider,
    LiveSignalingSession,
    ProviderPreparationError,
    SendLiveSignalingEvent,
)

__all__ = [
    "EXTENSION_API_VERSION",
    "CameraRuntimeProvider",
    "CameraRuntimeState",
    "LiveSignalingProvider",
    "LiveSignalingSession",
    "ProviderExtension",
    "ProviderPreparationError",
    "SendLiveSignalingEvent",
    "register_provider_extension",
]

EXTENSION_API_VERSION = 1
_DATA_PROVIDER_REGISTRY = "provider_registry"


@dataclass(frozen=True, slots=True)
class ProviderExtension:
    """One provider's optional, independently resolvable capabilities."""

    api_version: int
    provider_id: str
    entity_platforms: frozenset[str]
    camera_runtime: CameraRuntimeProvider | None = None
    camera_runtime_poll_interval: float | None = None
    live_signaling: LiveSignalingProvider | None = None


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

    @staticmethod
    def _validate(extension: ProviderExtension) -> None:
        if extension.api_version != EXTENSION_API_VERSION:
            raise ValueError(
                "Unsupported provider extension API version: "
                f"{extension.api_version}"
            )
        if not extension.provider_id.strip():
            raise ValueError("Provider extension ID must not be empty")
        if not extension.entity_platforms or any(
            not platform.strip() for platform in extension.entity_platforms
        ):
            raise ValueError("Provider extension must declare entity platforms")
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
    """Return the domain registry, creating built-in registrations once."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    registry = domain_data.get(_DATA_PROVIDER_REGISTRY)
    if isinstance(registry, ProviderRegistry):
        return registry
    registry = ProviderRegistry()
    _register_builtin_providers(registry)
    domain_data[_DATA_PROVIDER_REGISTRY] = registry
    return registry


def register_provider_extension(
    hass: HomeAssistant, extension: ProviderExtension
) -> Callable[[], None]:
    """Public entry point for a companion integration to register a provider."""
    return get_provider_registry(hass).register(extension)


def _register_builtin_providers(registry: ProviderRegistry) -> None:
    """Import and register built-in capability objects during backend setup."""
    registry.register(
        ProviderExtension(
            api_version=EXTENSION_API_VERSION,
            provider_id="frigate",
            entity_platforms=frozenset({"frigate"}),
            camera_runtime=cast(
                CameraRuntimeProvider,
                import_module(f"custom_components.{DOMAIN}.providers.frigate.camera"),
            ),
            camera_runtime_poll_interval=1.0,
            live_signaling=cast(
                LiveSignalingProvider,
                import_module(f"custom_components.{DOMAIN}.providers.frigate.live"),
            ),
        )
    )
