"""Frigate availability signal used to wake live recovery."""

from homeassistant.components import mqtt
from homeassistant.components.mqtt.models import ReceiveMessage
from homeassistant.core import HomeAssistant

from ..live_connection import (
    LiveAvailabilityCallback,
    LiveAvailabilityProvider,
    LiveAvailabilityUnsubscribe,
)
from .source import async_resolve_activity_identity


class FrigateLiveAvailabilityProvider:
    """Normalize Frigate's retained MQTT availability topic."""

    async def async_subscribe_availability(
        self,
        hass: HomeAssistant,
        entity_id: str,
        callback: LiveAvailabilityCallback,
    ) -> LiveAvailabilityUnsubscribe:
        """Subscribe to the selected camera's owning Frigate instance."""
        source = await async_resolve_activity_identity(hass, entity_id)

        def receive(message: ReceiveMessage) -> None:
            payload = message.payload
            if isinstance(payload, bytes):
                payload = payload.decode(errors="replace")
            normalized = str(payload).strip().lower()
            if normalized == "online":
                callback(True)
            elif normalized in {"offline", "stopped"}:
                callback(False)

        return await mqtt.async_subscribe(
            hass, f"{source.topic_prefix}/available", receive, qos=0
        )


live_availability: LiveAvailabilityProvider = FrigateLiveAvailabilityProvider()
