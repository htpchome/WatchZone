"""Tests for CameraOptics-managed live-only camera entities."""

from homeassistant.const import CONF_PASSWORD, CONF_URL, CONF_USERNAME
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.camera_optics.camera import (
    ATTR_MANAGED_SUBSTREAM,
    ExternalGo2RtcSubstreamCamera,
    HomeAssistantSubstreamCamera,
    async_setup_entry,
)
from custom_components.camera_optics.const import (
    CONF_GO2RTC_STREAMS,
    CONF_SOURCE_CAMERAS,
    DOMAIN,
    SUBENTRY_TYPE_EXTERNAL_GO2RTC,
    SUBENTRY_TYPE_HOME_ASSISTANT_SUBSTREAMS,
)


async def test_platform_builds_only_explicitly_managed_substream_entities(
    hass: HomeAssistant,
) -> None:
    """Typed child settings produce marked live-only entities."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        version=3,
        subentries_data=[
            {
                "subentry_type": SUBENTRY_TYPE_HOME_ASSISTANT_SUBSTREAMS,
                "title": "Home Assistant Substreams",
                "data": {CONF_SOURCE_CAMERAS: ["camera.porch_low"]},
            },
            {
                "subentry_type": SUBENTRY_TYPE_EXTERNAL_GO2RTC,
                "title": "go2rtc.example.test",
                "data": {
                    CONF_URL: "https://go2rtc.example.test",
                    CONF_USERNAME: "viewer",
                    CONF_PASSWORD: "secret",
                    CONF_GO2RTC_STREAMS: ["garage_low"],
                },
            },
        ],
    )
    entities: list[object] = []

    await async_setup_entry(hass, entry, entities.extend)

    assert len(entities) == 2
    assert isinstance(entities[0], HomeAssistantSubstreamCamera)
    assert isinstance(entities[1], ExternalGo2RtcSubstreamCamera)
    assert entities[0].unique_id == "home_assistant:camera.porch_low"
    assert entities[1].unique_id.endswith(":garage_low")
    assert entities[0].entity_registry_visible_default is False
    assert entities[1].entity_registry_visible_default is False
    assert entities[0].extra_state_attributes[ATTR_MANAGED_SUBSTREAM] is True
    assert entities[1].extra_state_attributes[ATTR_MANAGED_SUBSTREAM] is True
