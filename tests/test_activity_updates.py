"""Tests for provider-resolved real-time activity sources."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from custom_components.watchzone.extensions import (
    EXTENSION_API_VERSION,
    ProviderExtension,
    ProviderRegistry,
)
from custom_components.watchzone.features.activity_updates import ActivityUpdatesService
from custom_components.watchzone.providers.activity_updates import ActivityUpdateSource
from custom_components.watchzone.providers.frigate.activity_updates import (
    FrigateActivityUpdatesProvider,
)
from custom_components.watchzone.providers.frigate.source import (
    FrigateActivityIdentity,
    async_resolve_activity_identity,
)


class FakeActivityUpdatesProvider:
    """Resolve one provider-owned activity source."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def async_activity_update_source(
        self,
        hass: HomeAssistant,
        entity_id: str,
    ) -> ActivityUpdateSource:
        del hass
        self.calls.append(entity_id)
        return ActivityUpdateSource(
            type="frigate",
            instance_id="frigate-main",
            camera_name="front",
        )


async def test_service_resolves_source_through_entity_platform(
    hass: HomeAssistant,
) -> None:
    """The frontend receives provider identity without provider lookup rules."""
    entity = er.async_get(hass).async_get_or_create(
        "camera",
        "frigate",
        "front",
        suggested_object_id="front",
    )
    provider = FakeActivityUpdatesProvider()
    providers = ProviderRegistry()
    providers.register(
        ProviderExtension(
            api_version=EXTENSION_API_VERSION,
            provider_id="frigate",
            entity_platforms=frozenset({"frigate"}),
            activity_updates=provider,
        )
    )

    source = await ActivityUpdatesService(hass, providers).async_source(
        entity.entity_id
    )

    assert source == ActivityUpdateSource(
        type="frigate",
        instance_id="frigate-main",
        camera_name="front",
    )
    assert provider.calls == [entity.entity_id]


async def test_frigate_source_uses_owning_instance_and_camera(
    hass: HomeAssistant,
) -> None:
    """Multiple Frigate instances retain their official proxy identity."""
    resolved = SimpleNamespace(
        frigate_instance_id="frigate-west",
        camera_name="driveway",
    )
    resolver = AsyncMock(return_value=resolved)
    with patch(
        "custom_components.watchzone.providers.frigate.activity_updates.async_resolve_activity_identity",
        resolver,
    ):
        source = await FrigateActivityUpdatesProvider().async_activity_update_source(
            hass,
            "camera.driveway",
        )

    assert source == ActivityUpdateSource(
        type="frigate",
        instance_id="frigate-west",
        camera_name="driveway",
    )
    resolver.assert_awaited_once_with(hass, "camera.driveway")


async def test_frigate_activity_identity_does_not_require_live_stream(
    hass: HomeAssistant,
) -> None:
    """Activity subscriptions remain independent from live transport readiness."""
    entity = er.async_get(hass).async_get_or_create(
        "camera",
        "frigate",
        "front",
        suggested_object_id="front",
    )
    hass.states.async_set(
        entity.entity_id,
        "streaming",
        {"camera_name": "front", "client_id": "frigate-main"},
    )

    assert await async_resolve_activity_identity(
        hass, entity.entity_id
    ) == FrigateActivityIdentity(
        camera_name="front",
        frigate_instance_id="frigate-main",
    )
