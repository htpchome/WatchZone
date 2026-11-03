"""Tests for the public backend provider-extension contract."""

from types import SimpleNamespace

import pytest

from custom_components.watchzone.extensions import (
    EXTENSION_API_VERSION,
    ProviderExtension,
    ProviderRegistry,
)


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
