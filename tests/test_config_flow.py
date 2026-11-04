"""Tests for the WatchZone config flow."""

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.watchzone.const import (
    CAMERA_PRELOAD_TITLE,
    CONF_HLS_PREWARM_CAMERAS,
    DOMAIN,
    MAX_HLS_PREWARM_CAMERAS,
    NAME,
    SUBENTRY_TYPE_CAMERA_PRELOAD,
    SUBENTRY_UNIQUE_ID_CAMERA_PRELOAD,
)


def _preload_subentry_data(
    cameras: list[str] | None = None,
    title: str = CAMERA_PRELOAD_TITLE,
) -> list[dict[str, object]]:
    """Return config-entry test data for the singleton preload child."""
    return [
        {
            "subentry_type": SUBENTRY_TYPE_CAMERA_PRELOAD,
            "data": {CONF_HLS_PREWARM_CAMERAS: cameras or []},
            "title": title,
            "unique_id": SUBENTRY_UNIQUE_ID_CAMERA_PRELOAD,
        }
    ]


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
    entry = result["result"]
    preload = entry.get_subentries_of_type(SUBENTRY_TYPE_CAMERA_PRELOAD)
    assert len(preload) == 1
    assert preload[0].title == CAMERA_PRELOAD_TITLE
    assert preload[0].data == {CONF_HLS_PREWARM_CAMERAS: []}


async def test_user_flow_rejects_second_entry(hass: HomeAssistant) -> None:
    """WatchZone has one primary config entry."""
    MockConfigEntry(domain=DOMAIN, data={}).add_to_hass(hass)

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


async def test_subentry_flow_saves_explicit_hls_prewarm_allowlist(
    hass: HomeAssistant,
) -> None:
    """Only integration-selected cameras become backend pre-warm candidates."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        version=2,
        subentries_data=_preload_subentry_data(title="My warm cameras"),
    )
    entry.add_to_hass(hass)
    preload = entry.get_subentries_of_type(SUBENTRY_TYPE_CAMERA_PRELOAD)[0]

    result = await hass.config_entries.subentries.async_init(
        (entry.entry_id, SUBENTRY_TYPE_CAMERA_PRELOAD),
        context={
            "source": config_entries.SOURCE_RECONFIGURE,
            "subentry_id": preload.subentry_id,
        },
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "camera_preload"

    result = await hass.config_entries.subentries.async_configure(
        result["flow_id"],
        user_input={CONF_HLS_PREWARM_CAMERAS: ["camera.porch", "camera.garage"]},
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "reconfigure_successful"
    assert entry.subentries[preload.subentry_id].data == {
        CONF_HLS_PREWARM_CAMERAS: ["camera.porch", "camera.garage"]
    }
    assert entry.subentries[preload.subentry_id].title == "My warm cameras"
    assert entry.options == {}


async def test_subentry_flow_enforces_server_resource_budget(
    hass: HomeAssistant,
) -> None:
    """The form rejects an allowlist larger than the centralized budget."""
    entry = MockConfigEntry(
        domain=DOMAIN, data={}, version=2, subentries_data=_preload_subentry_data()
    )
    entry.add_to_hass(hass)
    preload = entry.get_subentries_of_type(SUBENTRY_TYPE_CAMERA_PRELOAD)[0]
    result = await hass.config_entries.subentries.async_init(
        (entry.entry_id, SUBENTRY_TYPE_CAMERA_PRELOAD),
        context={
            "source": config_entries.SOURCE_RECONFIGURE,
            "subentry_id": preload.subentry_id,
        },
    )

    result = await hass.config_entries.subentries.async_configure(
        result["flow_id"],
        user_input={
            CONF_HLS_PREWARM_CAMERAS: [
                f"camera.camera_{index}" for index in range(MAX_HLS_PREWARM_CAMERAS + 1)
            ]
        },
    )

    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {CONF_HLS_PREWARM_CAMERAS: "too_many_prewarm_cameras"}


async def test_subentry_flow_rejects_duplicate_preload_tile(
    hass: HomeAssistant,
) -> None:
    """The advertised Add action cannot create a parallel preload policy."""
    entry = MockConfigEntry(
        domain=DOMAIN, data={}, version=2, subentries_data=_preload_subentry_data()
    )
    entry.add_to_hass(hass)

    result = await hass.config_entries.subentries.async_init(
        (entry.entry_id, SUBENTRY_TYPE_CAMERA_PRELOAD),
        context={"source": config_entries.SOURCE_USER},
    )

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_camera_preload_allowed"
