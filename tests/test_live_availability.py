"""Tests for Frigate live-recovery availability signaling."""

from collections.abc import Callable
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, call, patch

from homeassistant.core import HomeAssistant

from custom_components.camera_optics.providers.frigate.availability import (
    FrigateLiveAvailabilityProvider,
)


async def test_frigate_availability_normalizes_mqtt_transitions(
    hass: HomeAssistant,
) -> None:
    """Only Frigate's documented availability values reach recovery."""
    receive: Callable[[object], None] | None = None
    unsubscribe = Mock()

    async def subscribe(
        _hass: HomeAssistant,
        topic: str,
        callback: Callable[[object], None],
        qos: int,
    ) -> Mock:
        nonlocal receive
        assert topic == "frigate/available"
        assert qos == 0
        receive = callback
        return unsubscribe

    with (
        patch(
            "custom_components.camera_optics.providers.frigate.availability."
            "async_resolve_activity_identity",
            AsyncMock(return_value=SimpleNamespace(topic_prefix="frigate")),
        ),
        patch(
            "custom_components.camera_optics.providers.frigate.availability."
            "mqtt.async_subscribe",
            side_effect=subscribe,
        ),
    ):
        callback = Mock()
        release = await FrigateLiveAvailabilityProvider().async_subscribe_availability(
            hass, "camera.front", callback
        )

    assert receive is not None
    receive(SimpleNamespace(payload=b"offline"))
    receive(SimpleNamespace(payload="online"))
    receive(SimpleNamespace(payload="unknown"))
    assert callback.call_args_list == [call(False), call(True)]
    release()
    unsubscribe.assert_called_once_with()
