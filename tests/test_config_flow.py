"""Tests for the WatchZone config flow."""

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.watchzone.const import (
    CONF_HLS_PREWARM_CAMERAS,
    DOMAIN,
    MAX_HLS_PREWARM_CAMERAS,
    NAME,
)


async def test_user_flow_creates_single_entry(hass: HomeAssistant) -> None:
    """The user flow creates the mandatory application entry."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], user_input={}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == NAME
    assert result["data"] == {}


async def test_user_flow_rejects_second_entry(hass: HomeAssistant) -> None:
    """WatchZone has one primary config entry."""
    MockConfigEntry(domain=DOMAIN, data={}).add_to_hass(hass)

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


async def test_options_flow_saves_explicit_hls_prewarm_allowlist(
    hass: HomeAssistant,
) -> None:
    """Only integration-selected cameras become backend pre-warm candidates."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.FORM

    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        user_input={CONF_HLS_PREWARM_CAMERAS: ["camera.porch", "camera.garage"]},
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options == {
        CONF_HLS_PREWARM_CAMERAS: ["camera.porch", "camera.garage"]
    }


async def test_options_flow_enforces_server_resource_budget(
    hass: HomeAssistant,
) -> None:
    """The form rejects an allowlist larger than the centralized budget."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)

    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        user_input={
            CONF_HLS_PREWARM_CAMERAS: [
                f"camera.camera_{index}" for index in range(MAX_HLS_PREWARM_CAMERAS + 1)
            ]
        },
    )

    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {CONF_HLS_PREWARM_CAMERAS: "too_many_prewarm_cameras"}
