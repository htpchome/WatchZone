"""Tests for the public backend provider-extension contract."""

from types import SimpleNamespace

import pytest

from custom_components.watchzone.extensions import (
    EXTENSION_API_VERSION,
    ProviderExtension,
    ProviderRegistry,
)
from custom_components.watchzone.features.live_connection import LiveConnectionService
from custom_components.watchzone.providers.live_connection import LiveSourceDescriptor


def test_provider_capabilities_are_resolved_and_cleanly_unregistered() -> None:
    """Eagerly registered capabilities resolve and cleanup removes every platform."""
    provider = SimpleNamespace()
    registry = ProviderRegistry()

    unregister = registry.register(
        ProviderExtension(
            api_version=EXTENSION_API_VERSION,
            provider_id="external-provider",
            entity_platforms=frozenset({"external_camera", "external_doorbell"}),
            camera_runtime=provider,
            camera_runtime_poll_interval=2.0,
        )
    )

    assert registry.camera_runtime("external_camera") is provider
    assert registry.camera_runtime("external_doorbell") is provider
    assert registry.camera_runtime_poll_interval("external_camera") == 2.0

    unregister()
    unregister()
    assert registry.camera_runtime("external_camera") is None
    assert registry.camera_runtime("external_doorbell") is None


def test_provider_registry_rejects_incompatible_or_conflicting_extensions() -> None:
    """An add-on cannot silently replace a core or newer contract."""
    registry = ProviderRegistry()
    registry.register(
        ProviderExtension(
            api_version=EXTENSION_API_VERSION,
            provider_id="first",
            entity_platforms=frozenset({"shared"}),
        )
    )

    with pytest.raises(ValueError, match="Unsupported provider extension API"):
        registry.register(
            ProviderExtension(
                api_version=EXTENSION_API_VERSION + 1,
                provider_id="future",
                entity_platforms=frozenset({"future"}),
            )
        )
    with pytest.raises(ValueError, match="Entity platform already registered"):
        registry.register(
            ProviderExtension(
                api_version=EXTENSION_API_VERSION,
                provider_id="second",
                entity_platforms=frozenset({"shared"}),
            )
        )


@pytest.mark.asyncio
async def test_live_connection_service_preserves_explicit_provider_choice() -> None:
    """An explicit connection never falls through to another provider."""

    class ConnectionProvider:
        def __init__(self, provider_id: str) -> None:
            self.provider_id = provider_id
            self.sources: list[str] = []
            self.talk: list[str] = []

        async def async_resolve_source(
            self, hass: object, entity_id: str
        ) -> LiveSourceDescriptor:
            del hass
            self.sources.append(entity_id)
            return LiveSourceDescriptor(
                id=f"{self.provider_id}:{entity_id}",
                type=self.provider_id,
            )

        async def async_talk_capability(
            self, hass: object, entity_id: str
        ) -> bool:
            del hass
            self.talk.append(entity_id)
            return self.provider_id == "frigate_go2rtc"

    home_assistant = ConnectionProvider("home_assistant")
    frigate = ConnectionProvider("frigate_go2rtc")
    registry = ProviderRegistry()
    for provider in (home_assistant, frigate):
        registry.register(
            ProviderExtension(
                api_version=EXTENSION_API_VERSION,
                provider_id=provider.provider_id,
                entity_platforms=frozenset(),
                live_source=provider,
                talk_capability=provider,
            )
        )
    service = LiveConnectionService(object(), registry)  # type: ignore[arg-type]

    source = await service.async_resolve_source(
        "home_assistant", "camera.front"
    )
    supported = await service.async_talk_capability(
        "home_assistant", "camera.front"
    )

    assert source.type == "home_assistant"
    assert supported is False
    assert home_assistant.sources == ["camera.front"]
    assert home_assistant.talk == ["camera.front"]
    assert frigate.sources == []
    assert frigate.talk == []
