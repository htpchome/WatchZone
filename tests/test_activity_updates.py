"""Tests for provider-normalized real-time activity subscriptions."""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from custom_components.watchzone.extensions import (
    EXTENSION_API_VERSION,
    ProviderExtension,
    ProviderRegistry,
)
from custom_components.watchzone.features.activity_updates import ActivityUpdatesService
from custom_components.watchzone.providers.activity_updates import (
    ActivityUpdateCallback,
    ActivityUpdateKind,
    ActivityUpdateNotification,
    ActivityUpdateUnsubscribe,
)
from custom_components.watchzone.providers.frigate.activity_updates import (
    FrigateActivityUpdatesProvider,
)
from custom_components.watchzone.providers.frigate.source import (
    FrigateActivityIdentity,
    async_resolve_activity_identity,
)


class FakeActivityUpdatesProvider:
    """Publish normalized updates through the provider capability."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, ActivityUpdateKind]] = []
        self.callback: ActivityUpdateCallback | None = None
        self.unsubscribe = AsyncMock()

    async def async_subscribe_activity_updates(
        self,
        hass: HomeAssistant,
        entity_id: str,
        kind: ActivityUpdateKind,
        callback: ActivityUpdateCallback,
    ) -> ActivityUpdateUnsubscribe:
        del hass
        self.calls.append((entity_id, kind))
        self.callback = callback
        return self.unsubscribe


async def test_service_subscribes_through_entity_platform(
    hass: HomeAssistant,
) -> None:
    """The feature resolves providers without exposing their identity."""
    entity = er.async_get(hass).async_get_or_create(
        "camera", "frigate", "front", suggested_object_id="front"
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
    callback = AsyncMock()

    unsubscribe = await ActivityUpdatesService(hass, providers).async_subscribe(
        entity.entity_id, "reviews", callback
    )

    assert unsubscribe is provider.unsubscribe
    assert provider.calls == [(entity.entity_id, "reviews")]
    assert provider.callback is callback


async def test_frigate_provider_normalizes_review_change_feed(
    hass: HomeAssistant,
) -> None:
    """Raw Frigate review payloads do not cross the provider boundary."""
    source = FrigateActivityIdentity(
        camera_name="driveway",
        frigate_instance_id="frigate-west",
        topic_prefix="west-frigate",
    )
    subscribe = AsyncMock(return_value=lambda: None)
    updates: list[ActivityUpdateNotification] = []
    with (
        patch(
            "custom_components.watchzone.providers.frigate.activity_updates.async_resolve_activity_identity",
            AsyncMock(return_value=source),
        ),
        patch(
            "custom_components.watchzone.providers.frigate.activity_updates.mqtt.async_subscribe",
            subscribe,
        ),
    ):
        await FrigateActivityUpdatesProvider().async_subscribe_activity_updates(
            hass, "camera.driveway", "reviews", updates.append
        )

    subscribe.assert_awaited_once()
    assert subscribe.await_args.args[1] == "west-frigate/reviews"
    receive = subscribe.await_args.args[2]
    receive(
        SimpleNamespace(
            payload=json.dumps(
                {
                    "type": "new",
                    "after": {
                        "camera": "front",
                        "id": "other-review",
                        "severity": "alert",
                        "start_time": 90,
                    },
                }
            )
        )
    )
    receive(
        SimpleNamespace(
            payload=json.dumps(
                {
                    "type": "new",
                    "after": {
                        "camera": "driveway",
                        "data": {
                            "detections": ["event-1"],
                            "metadata": {
                                "confidence": 98,
                                "other_concerns": ["Gate left open"],
                                "scene": "A resident approaches the car.",
                                "title": "Resident approaching car",
                            },
                            "objects": ["person"],
                            "sub_labels": ["Resident"],
                            "zones": ["driveway"],
                        },
                        "id": "review-1",
                        "severity": "detection",
                        "start_time": 100,
                    },
                }
            )
        )
    )

    assert len(updates) == 1
    update = updates[0]
    assert update == ActivityUpdateNotification(
        camera_name="driveway",
        topic="reviews",
        classification="detection",
        id="review-1",
        phase="new",
        review=update.review,
    )
    assert update.review is not None
    assert update.review.id == "frigate-west:review-1"
    assert update.review.labels == ("person",)
    assert update.review.sub_labels == ("Resident",)
    assert update.review.zones == ("driveway",)
    assert update.review.related_event_ids == ("frigate-west:event-1",)
    assert update.review.analysis_score == 0.98
    assert update.review.analysis_title == "Resident approaching car"


async def test_frigate_provider_treats_end_time_as_authoritative(
    hass: HomeAssistant,
) -> None:
    """An end timestamp wins over a stale provider phase."""
    source = FrigateActivityIdentity("front", "frigate-main", "frigate")
    subscribe = AsyncMock(return_value=lambda: None)
    updates: list[ActivityUpdateNotification] = []
    with (
        patch(
            "custom_components.watchzone.providers.frigate.activity_updates.async_resolve_activity_identity",
            AsyncMock(return_value=source),
        ),
        patch(
            "custom_components.watchzone.providers.frigate.activity_updates.mqtt.async_subscribe",
            subscribe,
        ),
    ):
        await FrigateActivityUpdatesProvider().async_subscribe_activity_updates(
            hass, "camera.front", "reviews", updates.append
        )
    receive = subscribe.await_args.args[2]
    receive(
        SimpleNamespace(
            payload=json.dumps(
                {
                    "type": "update",
                    "after": {
                        "camera": "front",
                        "end_time": 101,
                        "id": "review-1",
                        "severity": "alert",
                        "start_time": 100,
                    },
                }
            )
        )
    )

    assert updates[0].phase == "end"
    assert updates[0].review is not None
    assert updates[0].review.end_time == 101


async def test_frigate_provider_normalizes_event_invalidation_and_cleanup(
    hass: HomeAssistant,
) -> None:
    """Event subscribers receive provider-neutral invalidations and cleanup."""
    source = FrigateActivityIdentity("front", "frigate-main", "frigate")
    unsubscribe = Mock()
    subscribe = AsyncMock(return_value=unsubscribe)
    updates: list[ActivityUpdateNotification] = []
    with (
        patch(
            "custom_components.watchzone.providers.frigate.activity_updates.async_resolve_activity_identity",
            AsyncMock(return_value=source),
        ),
        patch(
            "custom_components.watchzone.providers.frigate.activity_updates.mqtt.async_subscribe",
            subscribe,
        ),
    ):
        release = (
            await FrigateActivityUpdatesProvider().async_subscribe_activity_updates(
                hass, "camera.front", "events", updates.append
            )
        )
    receive = subscribe.await_args.args[2]
    receive(
        SimpleNamespace(
            payload=json.dumps(
                {
                    "type": "new",
                    "after": {"camera": "front", "id": "event-1"},
                }
            )
        )
    )

    assert updates == [
        ActivityUpdateNotification(
            camera_name="front", topic="events", id="event-1", phase="new"
        )
    ]
    release()
    unsubscribe.assert_called_once_with()


async def test_frigate_activity_identity_does_not_require_live_stream(
    hass: HomeAssistant,
) -> None:
    """Activity subscriptions remain independent from live transport readiness."""
    entity = er.async_get(hass).async_get_or_create(
        "camera",
        "frigate",
        "front",
        suggested_object_id="front",
        config_entry="frigate-entry",
    )
    hass.states.async_set(
        entity.entity_id,
        "streaming",
        {"camera_name": "front", "client_id": "frigate-main"},
    )
    hass.data["frigate"] = {
        "frigate-entry": {"config": {"mqtt": {"topic_prefix": "north-frigate"}}}
    }

    assert await async_resolve_activity_identity(
        hass, entity.entity_id
    ) == FrigateActivityIdentity(
        camera_name="front",
        frigate_instance_id="frigate-main",
        topic_prefix="north-frigate",
    )
