"""Tests for provider-neutral real-time activity invalidations."""

from __future__ import annotations

from collections.abc import Callable
from unittest.mock import Mock

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from custom_components.watchzone.extensions import (
    EXTENSION_API_VERSION,
    ProviderExtension,
    ProviderRegistry,
)
from custom_components.watchzone.features.activity_updates import (
    ActivityUpdatesService,
)
from custom_components.watchzone.providers.activity_updates import (
    ActivityUpdateKind,
    ActivityUpdateListener,
)
from custom_components.watchzone.providers.frigate.activity_updates import (
    _activity_payload_matches,
    _topic_prefix,
)


class FakeActivityUpdatesProvider:
    """Record and publish one provider subscription."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, ActivityUpdateKind]] = []
        self.listener: ActivityUpdateListener | None = None
        self.unsubscribe = Mock()

    async def async_subscribe_activity_updates(
        self,
        hass: HomeAssistant,
        entity_id: str,
        kind: ActivityUpdateKind,
        listener: ActivityUpdateListener,
    ) -> Callable[[], None]:
        del hass
        self.calls.append((entity_id, kind))
        self.listener = listener
        return self.unsubscribe


async def test_service_coalesces_consumers_and_releases_last_listener(
    hass: HomeAssistant,
) -> None:
    """Alerts and the calendar share one provider subscription per camera."""
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
    service = ActivityUpdatesService(hass, providers)
    first = Mock()
    second = Mock()

    unsubscribe_first = await service.async_subscribe(
        entity.entity_id, "reviews", first
    )
    unsubscribe_second = await service.async_subscribe(
        entity.entity_id, "reviews", second
    )

    assert provider.calls == [(entity.entity_id, "reviews")]
    assert provider.listener is not None
    provider.listener()
    first.assert_called_once_with()
    second.assert_called_once_with()

    unsubscribe_first()
    provider.unsubscribe.assert_not_called()
    unsubscribe_second()
    provider.unsubscribe.assert_called_once_with()
    await service.async_close()


def test_frigate_event_payload_is_scoped_to_owning_camera() -> None:
    """A shared instance topic only invalidates the matching camera."""
    payload = '{"after":{"camera":"front"}}'

    assert _activity_payload_matches(payload, "front", "events") is True
    assert _activity_payload_matches(payload, "back", "events") is False


def test_frigate_reviews_ignore_motion_and_accept_before_payload() -> None:
    """Only alert/detection reviews drive the WatchZone activity surfaces."""
    assert (
        _activity_payload_matches(
            '{"after":{"camera":"front","severity":"detection"}}',
            "front",
            "reviews",
        )
        is True
    )
    assert (
        _activity_payload_matches(
            '{"before":{"camera":"front","severity":"alert"}}',
            "front",
            "reviews",
        )
        is True
    )
    assert (
        _activity_payload_matches(
            '{"after":{"camera":"front","severity":"motion"}}',
            "front",
            "reviews",
        )
        is False
    )
    assert _activity_payload_matches("invalid", "front", "reviews") is False


def test_frigate_topic_prefix_comes_from_instance_config() -> None:
    """Each resolved Frigate instance controls its own MQTT topic prefix."""
    assert _topic_prefix({"mqtt": {"topic_prefix": "site-west"}}) == "site-west"
    assert _topic_prefix({"mqtt": {}}) is None
