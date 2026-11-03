# Backend Extensions

This document records the backend extension boundary. It exists so future
providers and other optional backend features do not require reverse-engineering
the integration runtime or adding concrete-provider branches to core features.

## Scope

The first public extension point is a provider capability registry. It supports
both WatchZone's built-in providers and independently installed Home Assistant
custom integrations. A companion integration can implement one or more narrow
capabilities, such as camera runtime control or accelerated live signaling,
without being copied beneath WatchZone's source package.

An extension is a companion custom integration, not a Home Assistant Supervisor
add-on. WatchZone does not download, install, or execute unregistered Python
packages. The companion integration declares WatchZone as a dependency and is
installed and trusted separately by the user.

## Public contract

External integrations import only `custom_components.watchzone.extensions`.
That module exports:

- `EXTENSION_API_VERSION`;
- `ProviderExtension` and the provider capability protocols/models;
- `register_provider_extension()`.

The remaining WatchZone Python package is private implementation. An extension
must not import feature services, API handlers, storage, runtime composition, or
concrete built-in providers.

A registration declares:

- an exact extension API version;
- a stable provider ID;
- the Home Assistant entity platforms it owns, when the capability attaches to
  existing HA entities;
- only the capability objects it implements;
- a bounded reconciliation interval only when its runtime truth cannot be
  observed reliably through HA state events.

Capability objects register eagerly so missing or incompatible implementations
fail during integration setup. Registration must not perform network I/O. The
capability owns async work and cleanup according to its protocol and starts that
work only when configured or requested. A capability can be a module
implementing the structural protocol or a stateful instance when identity and
lifecycle justify a class.

WatchZone's composition root imports its built-in capability modules as part of
Home Assistant's integration-module load, then registers those already-loaded
objects during setup. Optional integration modules discovered later must use
Home Assistant's async import helper. Provider registration and request paths
must never call Python's blocking `import_module()` on the event loop.

## Lifecycle example

```python
from custom_components.watchzone.extensions import (
    EXTENSION_API_VERSION,
    ProviderExtension,
    register_provider_extension,
)


async def async_setup_entry(hass, entry):
    provider = MyProviderCapability(entry)
    unregister = register_provider_extension(
        hass,
        ProviderExtension(
            api_version=EXTENSION_API_VERSION,
            provider_id="example_provider",
            entity_platforms=frozenset({"example_camera"}),
            camera_runtime=provider,
        ),
    )
    entry.async_on_unload(unregister)
    return True
```

Registration rejects an incompatible API version, a duplicate provider ID, or
an entity platform already owned by another registration. The returned cleanup
is idempotent and must be attached to the companion config entry's unload
lifecycle.

## Ownership rules

- Feature services depend on provider-neutral protocols and the registry only.
- Provider implementations own authentication, clients, external API quirks,
  normalization, and provider resources.
- API handlers own Home Assistant transport validation and authorization; an
  extension does not register frontend-facing WatchZone messages directly.
- Active sessions own their acquired provider resource. Unregistration blocks
  new resolutions; it does not reach into unrelated active session ownership.
- A provider failure affects only its capability. Defined generic fallbacks,
  such as standard Home Assistant WebRTC signaling, remain core behavior.
- External providers never receive the mutable `WatchZoneRuntime` or domain
  data dictionary.

## Adding other extension areas

Do not grow `ProviderExtension` into an unrestricted plugin object. When a real
non-provider extension area appears, define its own typed registration model,
registry, compatibility version, ownership rules, and unload behavior. Reuse
the lifecycle pattern, not a generic service locator. This keeps optional layout
tools, storage backends, analytics, or other future areas from becoming coupled
to provider internals.
