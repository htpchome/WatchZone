"""PTZ capability and motion through the selected Frigate integration."""

from __future__ import annotations

from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from ..ptz import PtzCapabilities, PtzDirection
from .capabilities import async_ptz_capabilities
from .source import async_resolve_source


class FrigatePtzProvider:
    """Own Frigate PTZ discovery and its registered service surface."""

    async def async_capabilities(
        self, hass: HomeAssistant, entity_id: str
    ) -> PtzCapabilities:
        await async_resolve_source(hass, entity_id)
        return await async_ptz_capabilities(hass, entity_id) or PtzCapabilities()

    async def async_start(
        self,
        hass: HomeAssistant,
        entity_id: str,
        direction: PtzDirection,
        context: Context,
    ) -> None:
        capabilities = await self.async_capabilities(hass, entity_id)
        supported = (
            capabilities.pan
            if direction in {"left", "right"}
            else capabilities.tilt
        )
        if not supported:
            raise HomeAssistantError("Camera does not support that PTZ direction")
        if not hass.services.has_service("frigate", "ptz"):
            raise HomeAssistantError("Frigate PTZ service is unavailable")
        await hass.services.async_call(
            "frigate",
            "ptz",
            {"action": "move", "argument": direction},
            blocking=True,
            context=context,
            target={"entity_id": entity_id},
        )

    async def async_stop(
        self, hass: HomeAssistant, entity_id: str, context: Context
    ) -> None:
        if not hass.services.has_service("frigate", "ptz"):
            return
        await hass.services.async_call(
            "frigate",
            "ptz",
            {"action": "stop"},
            blocking=True,
            context=context,
            target={"entity_id": entity_id},
        )


ptz = FrigatePtzProvider()
