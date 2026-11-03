"""Frigate camera runtime capability."""

from __future__ import annotations

from homeassistant.const import (
    ATTR_ENTITY_ID,
    ATTR_SUPPORTED_FEATURES,
    SERVICE_TURN_OFF,
    SERVICE_TURN_ON,
    STATE_IDLE,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
)
from homeassistant.core import Context, HomeAssistant

from ..camera import CameraRuntimeState

CAMERA_DOMAIN = "camera"
PROVIDER = "frigate"
async def async_get_state(hass: HomeAssistant, entity_id: str) -> CameraRuntimeState:
    """Read Frigate camera state through Home Assistant's camera contract."""
    state = hass.states.get(entity_id)
    available = state is not None and state.state not in {
        STATE_UNAVAILABLE,
        STATE_UNKNOWN,
    }
    attributes = state.attributes if state is not None else {}
    frigate_owned = bool(
        (attributes.get("client_id") or attributes.get("mqtt_client_id"))
        and attributes.get("camera_name")
    )
    raw_supported_features = attributes.get(ATTR_SUPPORTED_FEATURES)
    if isinstance(raw_supported_features, int | str):
        try:
            supported_features = int(raw_supported_features)
        except ValueError:
            supported_features = None
    else:
        supported_features = None
    return CameraRuntimeState(
        available=available,
        provider=PROVIDER,
        supported=available and frigate_owned,
        suspended=(
            available
            and frigate_owned
            and state is not None
            and state.state == STATE_IDLE
            and supported_features == 0
        ),
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
