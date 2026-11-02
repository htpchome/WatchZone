"""Frigate camera runtime capability."""

from __future__ import annotations

from homeassistant.const import (
    ATTR_ENTITY_ID,
    SERVICE_TURN_OFF,
    SERVICE_TURN_ON,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
)
from homeassistant.core import Context, HomeAssistant

from ..camera import CameraRuntimeState

PROVIDER = "frigate"
CAMERA_DOMAIN = "camera"


def _camera_is_on(hass: HomeAssistant, entity_id: str) -> bool:
    """Read the public camera property without eagerly loading camera media code."""
    from homeassistant.components.camera.helper import get_camera_from_entity_id

    return get_camera_from_entity_id(hass, entity_id).is_on


async def async_get_state(hass: HomeAssistant, entity_id: str) -> CameraRuntimeState:
    """Read Frigate camera state through Home Assistant's camera contract."""
    state = hass.states.get(entity_id)
    available = state is not None and state.state not in {
        STATE_UNAVAILABLE,
        STATE_UNKNOWN,
    }
    return CameraRuntimeState(
        available=available,
        provider=PROVIDER,
        supported=True,
        suspended=available and not _camera_is_on(hass, entity_id),
    )


async def async_set_suspended(
    hass: HomeAssistant,
    entity_id: str,
    suspended: bool,
    context: Context | None,
) -> None:
    """Suspend or resume Frigate using its public camera entity service."""
    await hass.services.async_call(
        CAMERA_DOMAIN,
        SERVICE_TURN_OFF if suspended else SERVICE_TURN_ON,
        {ATTR_ENTITY_ID: entity_id},
        blocking=True,
        context=context,
    )
