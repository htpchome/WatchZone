"""Config flow for WatchZone."""

from typing import Any, override

import voluptuous as vol
from homeassistant.config_entries import (
    SOURCE_USER,
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    ConfigSubentryFlow,
    SubentryFlowResult,
)
from homeassistant.core import callback
from homeassistant.helpers.selector import EntitySelector, EntitySelectorConfig

from .const import (
    CAMERA_PRELOAD_TITLE,
    CONF_HLS_PREWARM_CAMERAS,
    DOMAIN,
    MAX_HLS_PREWARM_CAMERAS,
    NAME,
    SUBENTRY_TYPE_CAMERA_PRELOAD,
    SUBENTRY_UNIQUE_ID_CAMERA_PRELOAD,
)


class WatchZoneConfigFlow(ConfigFlow, domain=DOMAIN):
    """Create the single WatchZone application entry."""

    VERSION = 2

    @classmethod
    @callback
    @override
    def async_get_supported_subentry_types(
        cls, config_entry: ConfigEntry
    ) -> dict[str, type[ConfigSubentryFlow]]:
        """Return the typed integration settings exposed as child tiles."""
        return {SUBENTRY_TYPE_CAMERA_PRELOAD: CameraPreloadSubentryFlow}

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle setup started from Devices & services."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(
                title=NAME,
                data={},
                subentries=[
                    {
                        "subentry_type": SUBENTRY_TYPE_CAMERA_PRELOAD,
                        "data": {CONF_HLS_PREWARM_CAMERAS: []},
                        "title": CAMERA_PRELOAD_TITLE,
                        "unique_id": SUBENTRY_UNIQUE_ID_CAMERA_PRELOAD,
                    }
                ],
            )

        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))


class CameraPreloadSubentryFlow(ConfigSubentryFlow):
    """Configure the singleton server-side camera preload policy."""

    async def async_step_camera_preload(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """Create or reconfigure the preloaded-cameras child entry."""
        entry = self._get_entry()
        is_new = self.source == SOURCE_USER
        existing = entry.get_subentries_of_type(SUBENTRY_TYPE_CAMERA_PRELOAD)
        if is_new and existing:
            return self.async_abort(reason="single_camera_preload_allowed")

        errors: dict[str, str] = {}
        if user_input is not None:
            selected = user_input.get(CONF_HLS_PREWARM_CAMERAS, [])
            if len(selected) > MAX_HLS_PREWARM_CAMERAS:
                errors[CONF_HLS_PREWARM_CAMERAS] = "too_many_prewarm_cameras"
            elif is_new:
                return self.async_create_entry(
                    title=CAMERA_PRELOAD_TITLE,
                    data={CONF_HLS_PREWARM_CAMERAS: selected},
                    unique_id=SUBENTRY_UNIQUE_ID_CAMERA_PRELOAD,
                )
            else:
                return self.async_update_and_abort(
                    entry,
                    self._get_reconfigure_subentry(),
                    title=CAMERA_PRELOAD_TITLE,
                    data={CONF_HLS_PREWARM_CAMERAS: selected},
                )

        current = (
            []
            if is_new
            else self._get_reconfigure_subentry().data.get(CONF_HLS_PREWARM_CAMERAS, [])
        )
        schema = vol.Schema(
            {
                vol.Optional(
                    CONF_HLS_PREWARM_CAMERAS,
                    default=current,
                ): EntitySelector(
                    EntitySelectorConfig(domain="camera", multiple=True, reorder=True)
                )
            }
        )
        return self.async_show_form(
            step_id="camera_preload", data_schema=schema, errors=errors
        )

    async_step_user = async_step_camera_preload
    async_step_reconfigure = async_step_camera_preload
