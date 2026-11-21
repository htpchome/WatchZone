"""Config flow for CameraOptics."""

from typing import Any, override
from urllib.parse import urlsplit

import voluptuous as vol
from homeassistant.config_entries import (
    SOURCE_USER,
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    ConfigSubentryFlow,
    OptionsFlow,
    SubentryFlowResult,
)
from homeassistant.const import CONF_PASSWORD, CONF_URL, CONF_USERNAME
from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.selector import (
    BooleanSelector,
    EntitySelector,
    EntitySelectorConfig,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .const import (
    CAMERA_PRELOAD_TITLE,
    CONF_DIAGNOSTIC_LOGGING,
    CONF_GO2RTC_STREAMS,
    CONF_HLS_PREWARM_CAMERAS,
    CONF_SOURCE_CAMERAS,
    DEFAULT_DIAGNOSTIC_LOGGING,
    DOMAIN,
    HOME_ASSISTANT_SUBSTREAMS_TITLE,
    MAX_HLS_PREWARM_CAMERAS,
    NAME,
    SUBENTRY_TYPE_CAMERA_PRELOAD,
    SUBENTRY_TYPE_EXTERNAL_GO2RTC,
    SUBENTRY_TYPE_HOME_ASSISTANT_SUBSTREAMS,
    SUBENTRY_UNIQUE_ID_CAMERA_PRELOAD,
    SUBENTRY_UNIQUE_ID_HOME_ASSISTANT_SUBSTREAMS,
)
from .providers.go2rtc.client import (
    Go2RtcAuthenticationError,
    Go2RtcConnection,
    Go2RtcConnectionError,
    async_list_streams,
)


class CameraOpticsConfigFlow(ConfigFlow, domain=DOMAIN):
    """Create the single CameraOptics application entry."""

    VERSION = 3

    @staticmethod
    @callback
    @override
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        """Return the integration-wide runtime options flow."""
        return CameraOpticsOptionsFlow()

    @classmethod
    @callback
    @override
    def async_get_supported_subentry_types(
        cls, config_entry: ConfigEntry
    ) -> dict[str, type[ConfigSubentryFlow]]:
        """Return the typed integration settings exposed as child tiles."""
        return {
            SUBENTRY_TYPE_CAMERA_PRELOAD: CameraPreloadSubentryFlow,
            SUBENTRY_TYPE_HOME_ASSISTANT_SUBSTREAMS: (
                HomeAssistantSubstreamsSubentryFlow
            ),
            SUBENTRY_TYPE_EXTERNAL_GO2RTC: ExternalGo2RtcSubentryFlow,
        }

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


class CameraOpticsOptionsFlow(OptionsFlow):
    """Configure bounded integration-wide diagnostics."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Configure volatile backend diagnostic capture."""
        if user_input is not None:
            return self.async_create_entry(
                title="",
                data={**self.config_entry.options, **user_input},
            )

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_DIAGNOSTIC_LOGGING,
                        default=self.config_entry.options.get(
                            CONF_DIAGNOSTIC_LOGGING,
                            DEFAULT_DIAGNOSTIC_LOGGING,
                        ),
                    ): BooleanSelector()
                }
            ),
        )


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


class HomeAssistantSubstreamsSubentryFlow(ConfigSubentryFlow):
    """Select existing HA cameras that are actually backed by core go2rtc."""

    async def async_step_home_assistant_substreams(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """Create or reconfigure the singleton HA-go2rtc source selection."""
        entry = self._get_entry()
        is_new = self.source == SOURCE_USER
        existing = entry.get_subentries_of_type(SUBENTRY_TYPE_HOME_ASSISTANT_SUBSTREAMS)
        if is_new and existing:
            return self.async_abort(reason="single_home_assistant_substreams_allowed")

        options = await _async_home_assistant_go2rtc_camera_options(self.hass)
        valid_ids = {option["value"] for option in options}
        current = (
            []
            if is_new
            else self._get_reconfigure_subentry().data.get(CONF_SOURCE_CAMERAS, [])
        )
        current = [entity_id for entity_id in current if entity_id in valid_ids]

        errors: dict[str, str] = {}
        if user_input is not None:
            selected = user_input.get(CONF_SOURCE_CAMERAS, [])
            if any(entity_id not in valid_ids for entity_id in selected):
                errors[CONF_SOURCE_CAMERAS] = "invalid_source_camera"
            elif is_new:
                return self.async_create_entry(
                    title=HOME_ASSISTANT_SUBSTREAMS_TITLE,
                    data={CONF_SOURCE_CAMERAS: selected},
                    unique_id=SUBENTRY_UNIQUE_ID_HOME_ASSISTANT_SUBSTREAMS,
                )
            else:
                return self.async_update_and_abort(
                    entry,
                    self._get_reconfigure_subentry(),
                    data={CONF_SOURCE_CAMERAS: selected},
                )

        return self.async_show_form(
            step_id="home_assistant_substreams",
            data_schema=vol.Schema(
                {
                    vol.Optional(CONF_SOURCE_CAMERAS, default=current): SelectSelector(
                        SelectSelectorConfig(options=options, multiple=True)
                    )
                }
            ),
            errors=errors,
        )

    async_step_user = async_step_home_assistant_substreams
    async_step_reconfigure = async_step_home_assistant_substreams


class ExternalGo2RtcSubentryFlow(ConfigSubentryFlow):
    """Configure one external go2rtc server and its managed streams."""

    def __init__(self) -> None:
        """Initialize transient validated connection state."""
        self._connection: Go2RtcConnection | None = None
        self._available_streams: tuple[str, ...] = ()

    async def async_step_external_go2rtc(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """Validate server details before exposing its stream list."""
        is_new = self.source == SOURCE_USER
        existing_data = {} if is_new else dict(self._get_reconfigure_subentry().data)
        errors: dict[str, str] = {}
        if user_input is not None:
            url = str(user_input[CONF_URL]).strip().rstrip("/")
            username = str(user_input.get(CONF_USERNAME, "")).strip()
            supplied_password = str(user_input.get(CONF_PASSWORD, ""))
            password = supplied_password or str(existing_data.get(CONF_PASSWORD, ""))
            connection = Go2RtcConnection(
                url=url,
                username=username or None,
                password=(password or None) if username else None,
            )
            if not _is_valid_http_url(url):
                errors[CONF_URL] = "invalid_url"
            elif _external_url_is_duplicate(
                self._get_entry(),
                url,
                None if is_new else self._get_reconfigure_subentry().subentry_id,
            ):
                errors[CONF_URL] = "duplicate_server"
            else:
                try:
                    streams = await async_list_streams(self.hass, connection)
                except Go2RtcAuthenticationError:
                    errors["base"] = "invalid_auth"
                except Go2RtcConnectionError:
                    errors["base"] = "cannot_connect"
                else:
                    if not streams:
                        errors["base"] = "no_streams"
                    else:
                        self._connection = connection
                        self._available_streams = streams
                        return await self.async_step_external_go2rtc_streams()

        schema = vol.Schema(
            {
                vol.Required(
                    CONF_URL,
                    default=existing_data.get(CONF_URL, "http://"),
                ): TextSelector(TextSelectorConfig(type=TextSelectorType.URL)),
                vol.Optional(
                    CONF_USERNAME,
                    default=existing_data.get(CONF_USERNAME, ""),
                ): TextSelector(TextSelectorConfig(type=TextSelectorType.TEXT)),
                vol.Optional(CONF_PASSWORD): TextSelector(
                    TextSelectorConfig(type=TextSelectorType.PASSWORD)
                ),
            }
        )
        return self.async_show_form(
            step_id="external_go2rtc", data_schema=schema, errors=errors
        )

    async def async_step_external_go2rtc_streams(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """Choose which discovered streams become managed camera entities."""
        if self._connection is None or not self._available_streams:
            return await self.async_step_external_go2rtc()

        is_new = self.source == SOURCE_USER
        existing_data = {} if is_new else dict(self._get_reconfigure_subentry().data)
        current = [
            stream
            for stream in existing_data.get(CONF_GO2RTC_STREAMS, [])
            if stream in self._available_streams
        ]
        if user_input is not None:
            selected = user_input.get(CONF_GO2RTC_STREAMS, [])
            if any(stream not in self._available_streams for stream in selected):
                return self.async_show_form(
                    step_id="external_go2rtc_streams",
                    data_schema=self._stream_schema(current),
                    errors={CONF_GO2RTC_STREAMS: "invalid_stream"},
                )
            data: dict[str, Any] = {
                CONF_URL: self._connection.url,
                CONF_GO2RTC_STREAMS: selected,
            }
            if self._connection.username:
                data[CONF_USERNAME] = self._connection.username
            if self._connection.password:
                data[CONF_PASSWORD] = self._connection.password
            title = urlsplit(self._connection.url).hostname or "External go2rtc"
            if is_new:
                return self.async_create_entry(title=title, data=data)
            return self.async_update_and_abort(
                self._get_entry(),
                self._get_reconfigure_subentry(),
                title=title,
                data=data,
            )

        return self.async_show_form(
            step_id="external_go2rtc_streams",
            data_schema=self._stream_schema(current),
        )

    def _stream_schema(self, current: list[str]) -> vol.Schema:
        return vol.Schema(
            {
                vol.Required(CONF_GO2RTC_STREAMS, default=current): SelectSelector(
                    SelectSelectorConfig(
                        options=list(self._available_streams), multiple=True
                    )
                )
            }
        )

    async_step_user = async_step_external_go2rtc
    async_step_reconfigure = async_step_external_go2rtc


async def _async_home_assistant_go2rtc_camera_options(
    hass: Any,
) -> list[SelectOptionDict]:
    """Return public HA camera entities currently attached to core go2rtc."""
    from homeassistant.components.camera.helper import get_camera_from_entity_id

    registry = er.async_get(hass)
    options: list[SelectOptionDict] = []
    for state in hass.states.async_all("camera"):
        registry_entry = registry.async_get(state.entity_id)
        if registry_entry is not None and registry_entry.platform == DOMAIN:
            continue
        try:
            camera = get_camera_from_entity_id(hass, state.entity_id)
        except ValueError:
            continue
        provider = camera.webrtc_provider
        if provider is None or provider.domain != "go2rtc":
            continue
        options.append(
            SelectOptionDict(
                value=state.entity_id,
                label=state.name or state.entity_id,
            )
        )
    return sorted(options, key=lambda option: option["label"].casefold())


def _is_valid_http_url(value: str) -> bool:
    parsed = urlsplit(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.hostname)


def _external_url_is_duplicate(
    entry: ConfigEntry, url: str, excluded_subentry_id: str | None
) -> bool:
    normalized = url.casefold().rstrip("/")
    return any(
        subentry.subentry_id != excluded_subentry_id
        and str(subentry.data.get(CONF_URL, "")).casefold().rstrip("/") == normalized
        for subentry in entry.get_subentries_of_type(SUBENTRY_TYPE_EXTERNAL_GO2RTC)
    )
