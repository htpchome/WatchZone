"""PTZ through the selected Frigate integration entry."""

from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from ..ptz import PtzCapabilities, PtzDirection
from .capabilities import async_ptz_capabilities


async def async_capabilities(
    hass: HomeAssistant, entity_id: str
) -> PtzCapabilities:
    return await async_ptz_capabilities(hass, entity_id) or PtzCapabilities()


async def async_start(
    hass: HomeAssistant,
    entity_id: str,
    direction: PtzDirection,
    context: Context,
) -> None:
    capabilities = await async_capabilities(hass, entity_id)
    supported = (
        capabilities.pan
        if direction in {"left", "right"}
        else capabilities.tilt
    )
    if not supported:
        raise HomeAssistantError("Camera does not support that PTZ direction")
    await hass.services.async_call(
        "frigate",
        "ptz",
        {"action": "move", "argument": direction},
        blocking=True,
        context=context,
        target={"entity_id": entity_id},
    )


async def async_stop(
    hass: HomeAssistant, entity_id: str, context: Context
) -> None:
    await hass.services.async_call(
        "frigate",
        "ptz",
        {"action": "stop"},
        blocking=True,
        context=context,
        target={"entity_id": entity_id},
    )
