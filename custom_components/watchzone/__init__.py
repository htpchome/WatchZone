"""WatchZone integration setup."""

from __future__ import annotations

import logging
from pathlib import Path
from types import MappingProxyType
from urllib.parse import urlsplit

from homeassistant.components.http.server import StaticPathConfig
from homeassistant.components.lovelace.const import (
    CONF_RESOURCE_TYPE_WS,
    LOVELACE_DATA,
)
from homeassistant.components.lovelace.resources import (
    ResourceStorageCollection,
    ResourceYAMLCollection,
)
from homeassistant.config_entries import ConfigEntry, ConfigSubentry
from homeassistant.const import CONF_ID, CONF_TYPE, CONF_URL
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import (
    CAMERA_PRELOAD_TITLE,
    CARD_FILENAME,
    CARD_MODULE_URL,
    CONF_HLS_PREWARM_CAMERAS,
    DATA_RUNTIME,
    DOMAIN,
    FRONTEND_URL_BASE,
    SUBENTRY_TYPE_CAMERA_PRELOAD,
    SUBENTRY_UNIQUE_ID_CAMERA_PRELOAD,
)
from .extensions import (
    EXTENSION_API_VERSION,
    ProviderExtension,
    ProviderRegistry,
    get_provider_registry,
)
from .features.activity_updates import ActivityUpdatesService
from .features.camera_runtime import CameraRuntimeService
from .features.events import EventsService
from .features.hls_prewarm import HlsPrewarmService
from .features.layouts import StageDesignStore
from .features.live import LiveSignalingService
from .features.ptz import PtzService
from .features.recordings import RecordingsService
from .features.reviews import ReviewsService
from .providers.frigate import camera as frigate_camera
from .providers.frigate import live as frigate_live
from .providers.frigate.activity_updates import (
    activity_updates as frigate_activity_updates,
)
from .providers.frigate.events import events as frigate_events
from .providers.frigate.ptz import ptz as frigate_ptz
from .providers.frigate.recordings import recordings as frigate_recordings
from .providers.frigate.reviews import reviews as frigate_reviews
from .providers.home_assistant.ptz import ptz as home_assistant_ptz
from .runtime import WatchZoneRuntime

_LOGGER = logging.getLogger(__name__)

_FRONTEND_DIRECTORY = Path(__file__).parent / "frontend"
_CARD_PATH = _FRONTEND_DIRECTORY / CARD_FILENAME
_ASSET_DIRECTORY = _FRONTEND_DIRECTORY / "assets"
_DATA_RESOURCE_ID = "resource_id"
_DATA_YAML_RESOURCE = "yaml_resource"
_DATA_BUILTIN_PROVIDERS = "builtin_providers_registered"

type WatchZoneConfigEntry = ConfigEntry[WatchZoneRuntime]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the packaged frontend's authenticated static routes."""
    if not _CARD_PATH.is_file():
        _LOGGER.error("Packaged frontend asset is missing: %s", _CARD_PATH)
        return False

    static_paths = [
        StaticPathConfig(
            f"{FRONTEND_URL_BASE}/{CARD_FILENAME}",
            str(_CARD_PATH),
            False,
        )
    ]
    if _ASSET_DIRECTORY.is_dir():
        static_paths.append(
            StaticPathConfig(
                f"{FRONTEND_URL_BASE}/assets",
                str(_ASSET_DIRECTORY),
                True,
            )
        )

    await hass.http.async_register_static_paths(static_paths)
    hass.data.setdefault(DOMAIN, {})
    _register_builtin_providers(hass)
    from .api.activity_updates import (
        async_register as async_register_activity_updates_api,
    )
    from .api.camera import async_register as async_register_camera_api
    from .api.events import async_register as async_register_events_api
    from .api.live import async_register as async_register_live_api
    from .api.ptz import async_register as async_register_ptz_api
    from .api.recordings import async_register as async_register_recordings_api
    from .api.reviews import async_register as async_register_reviews_api
    from .api.talk import async_register as async_register_talk_api

    async_register_activity_updates_api(hass)
    async_register_camera_api(hass)
    async_register_events_api(hass)
    async_register_live_api(hass)
    async_register_talk_api(hass)
    async_register_ptz_api(hass)
    async_register_recordings_api(hass)
    async_register_reviews_api(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: WatchZoneConfigEntry) -> bool:
    """Set up the configured WatchZone application."""
    providers = _register_builtin_providers(hass)
    camera_runtime = CameraRuntimeService(hass, providers)
    await camera_runtime.async_setup()
    hls_prewarm = HlsPrewarmService(hass)
    await hls_prewarm.async_setup(_prewarm_camera_ids(entry))
    stage_designs = StageDesignStore(hass)
    await stage_designs.async_setup()
    runtime = WatchZoneRuntime(
        entry_id=entry.entry_id,
        activity_updates=ActivityUpdatesService(hass, providers),
        camera_runtime=camera_runtime,
        hls_prewarm=hls_prewarm,
        live_signaling=LiveSignalingService(hass, providers),
        stage_designs=stage_designs,
        ptz=PtzService(hass, providers),
        recordings=RecordingsService(hass, providers),
        events=EventsService(hass, providers),
        reviews=ReviewsService(hass, providers),
    )
    entry.runtime_data = runtime
    hass.data.setdefault(DOMAIN, {})[DATA_RUNTIME] = runtime
    entry.async_on_unload(entry.add_update_listener(_async_entry_updated))
    await _async_register_card_resource(hass)
    return True


async def _async_entry_updated(
    hass: HomeAssistant, entry: WatchZoneConfigEntry
) -> None:
    """Reconcile typed child settings without reloading frontend resources."""
    del hass
    await entry.runtime_data.hls_prewarm.async_set_entities(_prewarm_camera_ids(entry))


def _prewarm_camera_ids(entry: ConfigEntry) -> list[str]:
    """Return the singleton camera-preload allowlist."""
    subentries = entry.get_subentries_of_type(SUBENTRY_TYPE_CAMERA_PRELOAD)
    if not subentries:
        return []
    selected = subentries[0].data.get(CONF_HLS_PREWARM_CAMERAS, [])
    return list(selected) if isinstance(selected, list) else []


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Move legacy prewarm options into the typed child configuration."""
    if entry.version > 2:
        return False

    if entry.version == 1:
        selected = entry.options.get(CONF_HLS_PREWARM_CAMERAS, [])
        if not entry.get_subentries_of_type(SUBENTRY_TYPE_CAMERA_PRELOAD):
            hass.config_entries.async_add_subentry(
                entry,
                ConfigSubentry(
                    data=MappingProxyType(
                        {
                            CONF_HLS_PREWARM_CAMERAS: (
                                list(selected) if isinstance(selected, list) else []
                            )
                        }
                    ),
                    subentry_type=SUBENTRY_TYPE_CAMERA_PRELOAD,
                    title=CAMERA_PRELOAD_TITLE,
                    unique_id=SUBENTRY_UNIQUE_ID_CAMERA_PRELOAD,
                ),
            )

        options = dict(entry.options)
        options.pop(CONF_HLS_PREWARM_CAMERAS, None)
        hass.config_entries.async_update_entry(entry, options=options, version=2)

    return True


def _register_builtin_providers(hass: HomeAssistant) -> ProviderRegistry:
    """Compose built-in capabilities once without importing on the event loop."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    registry = get_provider_registry(hass)
    if domain_data.get(_DATA_BUILTIN_PROVIDERS) is True:
        return registry
    registry.register(
        ProviderExtension(
            api_version=EXTENSION_API_VERSION,
            provider_id="home_assistant",
            entity_platforms=frozenset(),
            ptz=home_assistant_ptz,
        )
    )
    registry.register(
        ProviderExtension(
            api_version=EXTENSION_API_VERSION,
            provider_id="frigate_go2rtc",
            entity_platforms=frozenset({"frigate"}),
            activity_updates=frigate_activity_updates,
            camera_runtime=frigate_camera,
            camera_runtime_poll_interval=1.0,
            live_signaling=frigate_live,
            talk_signaling=frigate_live,
            ptz=frigate_ptz,
            recordings=frigate_recordings,
            events=frigate_events,
            reviews=frigate_reviews,
        )
    )
    domain_data[_DATA_BUILTIN_PROVIDERS] = True
    return registry


async def async_unload_entry(hass: HomeAssistant, entry: WatchZoneConfigEntry) -> bool:
    """Unload WatchZone and remove its Lovelace module resource."""
    domain_data = hass.data.get(DOMAIN)
    if not domain_data:
        return True

    await entry.runtime_data.async_close()
    domain_data.pop(DATA_RUNTIME, None)

    resources = hass.data[LOVELACE_DATA].resources
    if resource_id := domain_data.pop(_DATA_RESOURCE_ID, None):
        if isinstance(resources, ResourceStorageCollection):
            await resources.async_delete_item(resource_id)
    if yaml_resource := domain_data.pop(_DATA_YAML_RESOURCE, None):
        if (
            isinstance(resources, ResourceYAMLCollection)
            and yaml_resource in resources.data
        ):
            resources.data.remove(yaml_resource)

    return True


def _is_watchzone_resource(resource: dict[str, object]) -> bool:
    """Return whether a Lovelace resource points at WatchZone's stable entry."""
    url = resource.get(CONF_URL)
    return isinstance(url, str) and urlsplit(url).path == (
        f"{FRONTEND_URL_BASE}/{CARD_FILENAME}"
    )


async def _async_register_card_resource(hass: HomeAssistant) -> None:
    """Register the card through Lovelace's awaited module-resource path."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    resources = hass.data[LOVELACE_DATA].resources
    await resources.async_get_info()
    existing = next(
        (item for item in resources.async_items() if _is_watchzone_resource(item)),
        None,
    )

    if isinstance(resources, ResourceStorageCollection):
        if existing is None:
            existing = await resources.async_create_item(
                {
                    CONF_RESOURCE_TYPE_WS: "module",
                    CONF_URL: CARD_MODULE_URL,
                }
            )
        elif (
            existing.get(CONF_TYPE) != "module"
            or existing.get(CONF_URL) != CARD_MODULE_URL
        ):
            existing = await resources.async_update_item(
                existing[CONF_ID],
                {
                    CONF_RESOURCE_TYPE_WS: "module",
                    CONF_URL: CARD_MODULE_URL,
                },
            )
        domain_data[_DATA_RESOURCE_ID] = existing[CONF_ID]
        return

    assert isinstance(resources, ResourceYAMLCollection)
    if existing is None:
        existing = {CONF_TYPE: "module", CONF_URL: CARD_MODULE_URL}
        resources.data.append(existing)
        domain_data[_DATA_YAML_RESOURCE] = existing
