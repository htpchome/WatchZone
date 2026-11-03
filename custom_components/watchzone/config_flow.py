"""Config flow for WatchZone."""

from typing import Any, override

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback
from homeassistant.helpers.selector import EntitySelector, EntitySelectorConfig

from .const import (
    CONF_HLS_PREWARM_CAMERAS,
    DOMAIN,
    MAX_HLS_PREWARM_CAMERAS,
    NAME,
)


class WatchZoneConfigFlow(ConfigFlow, domain=DOMAIN):
    """Create the single WatchZone application entry."""

    VERSION = 1

    @staticmethod
    @callback
    @override
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        """Return integration-level camera resource settings."""
        return WatchZoneOptionsFlow()

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle setup started from Devices & services."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title=NAME, data={})

        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))


class WatchZoneOptionsFlow(OptionsFlow):
    """Configure backend-owned shared work."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Select only cameras that should keep a prepared HA HLS stream."""
        errors: dict[str, str] = {}
        if user_input is not None:
            selected = user_input.get(CONF_HLS_PREWARM_CAMERAS, [])
            if len(selected) > MAX_HLS_PREWARM_CAMERAS:
                errors[CONF_HLS_PREWARM_CAMERAS] = "too_many_prewarm_cameras"
            else:
                return self.async_create_entry(title="", data=user_input)

        schema = vol.Schema(
            {
                vol.Optional(
                    CONF_HLS_PREWARM_CAMERAS,
                    default=self.config_entry.options.get(CONF_HLS_PREWARM_CAMERAS, []),
                ): EntitySelector(
                    EntitySelectorConfig(domain="camera", multiple=True, reorder=True)
                )
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)
