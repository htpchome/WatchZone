"""CameraOptics Home Assistant API adapters."""

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from ..const import DATA_RUNTIME, DOMAIN, NAME
from ..runtime import CameraOpticsRuntime


def runtime_from_hass(hass: HomeAssistant) -> CameraOpticsRuntime:
    """Return the configured runtime or report a useful API failure."""
    runtime = hass.data.get(DOMAIN, {}).get(DATA_RUNTIME)
    if not isinstance(runtime, CameraOpticsRuntime):
        raise HomeAssistantError(f"{NAME} is not configured")
    return runtime
