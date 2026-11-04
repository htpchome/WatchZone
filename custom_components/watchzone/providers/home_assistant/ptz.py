"""PTZ through Home Assistant-owned entity and service surfaces."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er

from ..ptz import PtzCapabilities, PtzDirection

_DIRECTION_KEYS: dict[PtzDirection, str] = {
    "down": "ptz_down",
    "left": "ptz_left",
    "right": "ptz_right",
    "up": "ptz_up",
}
_ZOOM_KEYS = frozenset({"ptz_zoom_in", "ptz_zoom_out"})
_FOCUS_KEYS = frozenset(
    {"focus_far", "focus_near", "ptz_focus_far", "ptz_focus_near"}
)

type _SurfaceKind = Literal["buttons", "frigate_service", "onvif"]


@dataclass(frozen=True, slots=True)
class _Surface:
    kind: _SurfaceKind
    capabilities: PtzCapabilities
    controls: dict[str, str] | None = None
    onvif_mode: str | None = None


class HomeAssistantPtzProvider:
    """Discover and operate PTZ without contacting a camera provider API."""

    async def async_capabilities(
        self, hass: HomeAssistant, entity_id: str
    ) -> PtzCapabilities:
        """Return capability data exposed by the current HA installation."""
        return self._surface(hass, entity_id).capabilities

    async def async_start(
        self,
        hass: HomeAssistant,
        entity_id: str,
        direction: PtzDirection,
        context: Context,
    ) -> None:
        """Start continuous movement or perform one HA-native step."""
        surface = self._surface(hass, entity_id)
        self._require_direction(surface.capabilities, direction)
        if surface.kind == "buttons":
            control = (surface.controls or {}).get(_DIRECTION_KEYS[direction])
            if not control:
                raise HomeAssistantError("Camera does not support that PTZ direction")
            await hass.services.async_call(
                "button",
                "press",
                blocking=True,
                context=context,
                target={"entity_id": control},
            )
            return
        if surface.kind == "onvif":
            axis = "pan" if direction in {"left", "right"} else "tilt"
            await hass.services.async_call(
                "onvif",
                "ptz",
                {
                    axis: direction.upper(),
                    "continuous_duration": 0,
                    "move_mode": surface.onvif_mode,
                },
                blocking=True,
                context=context,
                target={"entity_id": entity_id},
            )
            return
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
        """Stop the selected HA PTZ surface; step controls need no stop."""
        surface = self._surface(hass, entity_id)
        if surface.kind == "buttons":
            control = (surface.controls or {}).get("ptz_stop")
            if control:
                await hass.services.async_call(
                    "button",
                    "press",
                    blocking=True,
                    context=context,
                    target={"entity_id": control},
                )
            return
        if surface.kind == "onvif":
            if surface.onvif_mode != "ContinuousMove":
                return
            await hass.services.async_call(
                "onvif",
                "ptz",
                {"move_mode": "Stop"},
                blocking=True,
                context=context,
                target={"entity_id": entity_id},
            )
            return
        await hass.services.async_call(
            "frigate",
            "ptz",
            {"action": "stop"},
            blocking=True,
            context=context,
            target={"entity_id": entity_id},
        )

    def _surface(self, hass: HomeAssistant, entity_id: str) -> _Surface:
        registry = er.async_get(hass)
        camera = registry.async_get(entity_id)
        if camera is None or camera.domain != "camera":
            raise HomeAssistantError("Camera is not registered in Home Assistant")

        if button_surface := self._button_surface(registry, camera):
            return button_surface
        if camera.platform == "onvif":
            return self._onvif_surface(hass, camera)
        if camera.platform == "frigate":
            return self._frigate_surface(hass, camera, entity_id)
        return _Surface("buttons", PtzCapabilities(), {})

    @staticmethod
    def _button_surface(
        registry: er.EntityRegistry, camera: er.RegistryEntry
    ) -> _Surface | None:
        if not camera.device_id:
            return None
        controls: dict[str, str] = {}
        for entry in er.async_entries_for_device(registry, camera.device_id):
            if entry.domain != "button" or entry.disabled_by is not None:
                continue
            key = entry.translation_key
            if isinstance(key, str) and (
                key in _DIRECTION_KEYS.values()
                or key in _ZOOM_KEYS
                or key in _FOCUS_KEYS
                or key == "ptz_stop"
            ):
                controls[key] = entry.entity_id
        pan = "ptz_left" in controls and "ptz_right" in controls
        tilt = "ptz_up" in controls and "ptz_down" in controls
        if not pan and not tilt:
            return None
        return _Surface(
            "buttons",
            PtzCapabilities(
                pan=pan,
                tilt=tilt,
                zoom=_ZOOM_KEYS.issubset(controls),
                focus=bool(_FOCUS_KEYS & controls.keys()),
            ),
            controls,
        )

    @staticmethod
    def _onvif_surface(
        hass: HomeAssistant, camera: er.RegistryEntry
    ) -> _Surface:
        if not camera.config_entry_id or not hass.services.has_service("onvif", "ptz"):
            return _Surface("onvif", PtzCapabilities())
        entry = hass.config_entries.async_get_entry(camera.config_entry_id)
        profiles = getattr(getattr(entry, "runtime_data", None), "profiles", ())
        profile_token = camera.unique_id.rsplit("#", 1)[-1]
        profile = next(
            (
                item
                for item in profiles
                if str(getattr(item, "token", "")) == profile_token
            ),
            None,
        )
        ptz = getattr(profile, "ptz", None)
        if ptz is None:
            return _Surface("onvif", PtzCapabilities())
        continuous = getattr(ptz, "continuous", False) is True
        relative = getattr(ptz, "relative", False) is True
        if not continuous and not relative:
            return _Surface("onvif", PtzCapabilities())
        presets = tuple(str(value) for value in getattr(ptz, "presets", ()) if value)
        return _Surface(
            "onvif",
            PtzCapabilities(pan=True, tilt=True, presets=presets),
            onvif_mode="ContinuousMove" if continuous else "RelativeMove",
        )

    @staticmethod
    def _frigate_surface(
        hass: HomeAssistant, camera: er.RegistryEntry, entity_id: str
    ) -> _Surface:
        if (
            not hass.services.has_service("frigate", "ptz")
            or not camera.config_entry_id
        ):
            return _Surface("frigate_service", PtzCapabilities())
        state = hass.states.get(entity_id)
        camera_name = state.attributes.get("camera_name") if state else None
        runtime = hass.data.get("frigate", {}).get(camera.config_entry_id, {})
        config = runtime.get("config", {}) if isinstance(runtime, dict) else {}
        cameras = config.get("cameras", {}) if isinstance(config, dict) else {}
        camera_config = (
            cameras.get(camera_name, {}) if isinstance(cameras, dict) else {}
        )
        onvif = camera_config.get("onvif") if isinstance(camera_config, dict) else None
        if not isinstance(onvif, dict) or not onvif:
            return _Surface("frigate_service", PtzCapabilities())
        return _Surface(
            "frigate_service",
            PtzCapabilities(pan=True, tilt=True),
        )

    @staticmethod
    def _require_direction(
        capabilities: PtzCapabilities, direction: PtzDirection
    ) -> None:
        supported = (
            capabilities.pan
            if direction in {"left", "right"}
            else capabilities.tilt
        )
        if not supported:
            raise HomeAssistantError("Camera does not support that PTZ direction")


ptz = HomeAssistantPtzProvider()
