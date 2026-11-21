"""Tests for provider-neutral PTZ capability and motion ownership."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from homeassistant.core import Context
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.camera_optics.extensions import (
    EXTENSION_API_VERSION,
    ProviderExtension,
    ProviderRegistry,
)
from custom_components.camera_optics.features.ptz import PtzService
from custom_components.camera_optics.providers.frigate.ptz import FrigatePtzProvider
from custom_components.camera_optics.providers.home_assistant.ptz import (
    HomeAssistantPtzProvider,
)
from custom_components.camera_optics.providers.ptz import PtzCapabilities


class FakePtzProvider:
    """Record normalized PTZ calls without depending on a concrete provider."""

    def __init__(self) -> None:
        self.presets: list[tuple[str, str]] = []
        self.starts: list[tuple[str, str]] = []
        self.stops: list[str] = []

    async def async_capabilities(self, hass: Any, entity_id: str) -> PtzCapabilities:
        del hass, entity_id
        return PtzCapabilities(pan=True, tilt=True, presets=("Home",))

    async def async_start(
        self,
        hass: Any,
        entity_id: str,
        direction: str,
        context: Context,
    ) -> None:
        del hass, context
        self.starts.append((entity_id, direction))

    async def async_stop(self, hass: Any, entity_id: str, context: Context) -> None:
        del hass, context
        self.stops.append(entity_id)

    async def async_recall_preset(
        self,
        hass: Any,
        entity_id: str,
        preset: str,
        context: Context,
    ) -> None:
        del hass, context
        self.presets.append((entity_id, preset))


async def test_ptz_service_resolves_capabilities_and_owns_motion() -> None:
    """A released subscription stops exactly the motion that it started."""
    provider = FakePtzProvider()
    service = PtzService(SimpleNamespace(), registry(provider))  # type: ignore[arg-type]

    capabilities = await service.async_capabilities("home_assistant", "camera.front")
    motion = await service.async_start(
        "home_assistant", "camera.front", "left", Context()
    )
    await service.async_stop(motion)
    await service.async_stop(motion)

    assert capabilities.pan is True
    assert capabilities.presets == ("Home",)
    assert provider.starts == [("camera.front", "left")]
    assert provider.stops == ["camera.front"]


async def test_new_ptz_motion_replaces_old_and_stale_cleanup_is_harmless() -> None:
    """Late cleanup from a prior request cannot stop the current request."""
    provider = FakePtzProvider()
    service = PtzService(SimpleNamespace(), registry(provider))  # type: ignore[arg-type]

    old = await service.async_start("home_assistant", "camera.front", "left", Context())
    current = await service.async_start(
        "home_assistant", "camera.front", "right", Context()
    )
    await service.async_stop(old)

    assert provider.starts == [
        ("camera.front", "left"),
        ("camera.front", "right"),
    ]
    assert provider.stops == ["camera.front"]

    await service.async_stop(current)
    assert provider.stops == ["camera.front", "camera.front"]


async def test_preset_recall_stops_directional_motion_without_owning_stop() -> None:
    """Preset recall is finite and does not create another active motion."""
    provider = FakePtzProvider()
    service = PtzService(SimpleNamespace(), registry(provider))  # type: ignore[arg-type]
    motion = await service.async_start(
        "home_assistant", "camera.front", "left", Context()
    )

    await service.async_recall_preset(
        "home_assistant", "camera.front", "Home", Context()
    )
    await service.async_stop(motion)

    assert provider.starts == [("camera.front", "left")]
    assert provider.stops == ["camera.front"]
    assert provider.presets == [("camera.front", "Home")]


async def test_ptz_service_stops_all_motion_during_unload() -> None:
    """Integration unload leaves no provider movement active."""
    provider = FakePtzProvider()
    service = PtzService(SimpleNamespace(), registry(provider))  # type: ignore[arg-type]
    await service.async_start("home_assistant", "camera.front", "up", Context())
    await service.async_start("home_assistant", "camera.back", "down", Context())

    await service.async_close()

    assert sorted(provider.stops) == ["camera.back", "camera.front"]


async def test_home_assistant_ptz_detects_and_uses_same_device_buttons(
    hass: Any,
) -> None:
    """Generic HA button entities are sufficient; Frigate is not required."""
    entity_registry = er.async_get(hass)
    config_entry = MockConfigEntry(domain="example", data={})
    config_entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=config_entry.entry_id,
        identifiers={("example", "front")},
    )
    camera = entity_registry.async_get_or_create(
        "camera",
        "example",
        "front",
        device_id=device.id,
        suggested_object_id="front",
    )
    buttons: dict[str, str] = {}
    for key in (
        "ptz_up",
        "ptz_down",
        "ptz_left",
        "ptz_right",
        "ptz_zoom_in",
        "ptz_zoom_out",
        "ptz_stop",
    ):
        entry = entity_registry.async_get_or_create(
            "button",
            "example",
            key,
            device_id=device.id,
            suggested_object_id=key,
            translation_key=key,
        )
        buttons[key] = entry.entity_id
    calls: list[str] = []

    async def async_press(call: Any) -> None:
        calls.append(call.data["entity_id"])

    hass.services.async_register("button", "press", async_press)
    provider = HomeAssistantPtzProvider()

    capabilities = await provider.async_capabilities(hass, camera.entity_id)
    await provider.async_start(hass, camera.entity_id, "left", Context())
    await provider.async_stop(hass, camera.entity_id, Context())
    await provider.async_start(hass, camera.entity_id, "zoom_in", Context())

    assert capabilities.pan is True
    assert capabilities.tilt is True
    assert capabilities.zoom is True
    assert calls == [
        buttons["ptz_left"],
        buttons["ptz_stop"],
        buttons["ptz_zoom_in"],
    ]


async def test_frigate_ptz_movement_requires_runtime_capability(
    hass: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A registered Frigate service cannot make every Frigate camera PTZ-capable."""
    config_entry = MockConfigEntry(domain="frigate", data={})
    config_entry.add_to_hass(hass)
    camera = er.async_get(hass).async_get_or_create(
        "camera",
        "frigate",
        "front",
        config_entry=config_entry,
        suggested_object_id="front",
    )
    hass.states.async_set(camera.entity_id, "streaming", {"camera_name": "front"})
    calls: list[Any] = []

    async def async_move(call: Any) -> None:
        calls.append(call)

    async def async_no_capabilities(hass_arg: Any, entity_id: str) -> PtzCapabilities:
        del hass_arg, entity_id
        return PtzCapabilities()

    hass.services.async_register("frigate", "ptz", async_move)
    monkeypatch.setattr(
        "custom_components.camera_optics.providers.home_assistant.ptz."
        "async_ptz_capabilities",
        async_no_capabilities,
    )
    provider = HomeAssistantPtzProvider()

    with pytest.raises(HomeAssistantError, match="does not support"):
        await provider.async_start(hass, camera.entity_id, "left", Context())

    assert calls == []


async def test_frigate_preset_recall_is_one_finite_service_call(hass: Any) -> None:
    """Preset recall does not depend on a second capability request."""
    calls: list[Any] = []

    async def async_ptz(call: Any) -> None:
        calls.append(call)

    hass.services.async_register("frigate", "ptz", async_ptz)
    provider = FrigatePtzProvider()

    await provider.async_recall_preset(hass, "camera.front", "Driveway", Context())

    assert len(calls) == 1
    assert calls[0].data == {
        "action": "preset",
        "argument": "Driveway",
        "entity_id": "camera.front",
    }


async def test_frigate_optical_zoom_uses_zoom_action_without_second_discovery(
    hass: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Optical zoom uses Frigate's command without a second capability poll."""
    calls: list[Any] = []

    async def async_ptz(call: Any) -> None:
        calls.append(call)

    hass.services.async_register("frigate", "ptz", async_ptz)
    provider = FrigatePtzProvider()
    provider._capabilities["camera.front"] = PtzCapabilities(  # noqa: SLF001
        pan=True,
        tilt=True,
        zoom=True,
    )

    async def unexpected_capabilities(hass_arg: Any, entity_id: str) -> PtzCapabilities:
        del hass_arg, entity_id
        raise AssertionError("motion activation must not rediscover capability")

    monkeypatch.setattr(provider, "async_capabilities", unexpected_capabilities)

    await provider.async_start(hass, "camera.front", "zoom_out", Context())
    await provider.async_stop(hass, "camera.front", Context())

    assert [call.data["action"] for call in calls] == ["zoom", "stop"]
    assert calls[0].data["argument"] == "out"


def registry(provider: FakePtzProvider) -> ProviderRegistry:
    """Build a registry containing only the provider-neutral PTZ contract."""
    providers = ProviderRegistry()
    providers.register(
        ProviderExtension(
            api_version=EXTENSION_API_VERSION,
            provider_id="home_assistant",
            entity_platforms=frozenset(),
            ptz=provider,  # type: ignore[arg-type]
        )
    )
    return providers
