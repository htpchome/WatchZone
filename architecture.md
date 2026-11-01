# WatchZone Architecture Contract

## 1. Purpose

This document is the architectural contract for WatchZone. It defines the
boundaries, dependency rules, performance requirements, and structural
decisions that all implementation work must follow.

WatchZone is one Home Assistant custom integration containing both:

- A Python backend running inside Home Assistant.
- A TypeScript and Lit frontend rendered as a Lovelace card and editor.

They are built, tested, packaged, versioned, and released together as one
integration. They are not independent products and do not carry compatibility
layers for mixing frontend and backend releases.

A configured WatchZone config entry is required. The frontend is packaged,
served, and registered by the Python integration and has no supported
standalone mode. Installing through HACS is followed by adding WatchZone under
Home Assistant's Devices & services settings.

The architecture is designed to support user-created layouts composed from
independent modules such as live video, event lists, camera selectors,
companion cameras, and navigation controls. Layouts are created and persisted
through the Python integration. Lovelace YAML does not contain the layout
definition.

This contract is intentionally strict at system boundaries and intentionally
light inside a feature. A feature starts small and gains files only when its
own responsibilities require them.

## 2. Architectural goals

In priority order, WatchZone must be:

1. **Correct and maintainable:** A change inside one feature must not cause
   unrelated features to change or fail.
2. **Fast:** Initial code, rendering work, network traffic, and retained memory
   must remain proportional to the modules the user actually displays.
3. **Modular:** Layout, modules, providers, live connection adapters, storage,
   and Home Assistant adapters have explicit contracts and one-way
   dependencies.
4. **Resilient:** A failed module, provider request, or optional feature must
   not take down the entire card.
5. **Native to Home Assistant:** Use supported Home Assistant lifecycle,
   authentication, storage, WebSocket, translation, and configuration APIs.
6. **Simple where possible:** Do not introduce an abstraction, file, or runtime
   layer without a concrete responsibility.

## 3. Non-goals

WatchZone does not:

- Store layout trees in Lovelace YAML.
- Recreate FrigateViewCard's single-view architecture as the application root.
- Put all behavior into one card class, coordinator, state store, or backend
  manager.
- Require every backend feature to use `DataUpdateCoordinator` or expose Home
  Assistant entities.
- Require every frontend helper to be a custom element.
- Support separately installed or independently versioned frontend and backend
  packages.
- Support a frontend-only or partially configured degraded operating mode.
- Treat a camera's provider and live connection method as the same concept.
- Load every module or the visual editor during normal card startup.
- Preserve dead APIs or internal compatibility layers without an explicit
  migration requirement.
- Allow stored layouts to inject arbitrary HTML, JavaScript, or unrestricted
  CSS.

## 4. System boundaries

```text
Home Assistant / Lovelace
          |
          v
  Eager card shell
          |
          v
 Layout runtime + module loader
          |
          +------ dynamic import ------> Feature modules
          |
          +------ dynamic import ------> Live connection adapters
          |
          v
 Typed frontend API client
          |
          v
 Home Assistant WebSocket API
          |
          v
 Python API adapters
          |
          v
 Backend feature services
          |
          +----------------------------> Layout storage
          |
          +----------------------------> Provider adapters (Frigate, etc.)
```

Dependencies flow downward in this diagram. A lower layer must not import or
call into a higher layer.

## 5. Repository structure

The following roots are stable. New top-level source roots require an
architecture decision recorded in this document or a future ADR.

```text
.
├── architecture.md
├── hacs.json                       # HACS release-install metadata
├── docs/
│   ├── config-editor-lifecycle.md # Draft and preview contract
│   └── live-session-lifecycle.md  # Retention and audio-state contract
├── dist/                          # Generated output; never source
│   ├── frontend/                  # Vite entry and lazy chunks
│   ├── package/                   # Assembled integration staging tree
│   └── watchzone.zip              # HACS release asset
├── custom_components/
│   └── watchzone/                 # Shipped Python integration
│       ├── __init__.py            # Composition root and HA lifecycle
│       ├── manifest.json
│       ├── const.py
│       ├── runtime.py             # Typed per-entry runtime container
│       ├── api/                   # HA WebSocket/HTTP boundary adapters
│       ├── features/              # Backend use cases grouped by feature
│       ├── providers/             # Frigate and future external adapters
│       ├── storage/               # Versioned persisted-data adapters
│       ├── translations/
│       └── frontend/              # Generated release assets only
├── frontend/
│   ├── src/
│   │   ├── main.ts                # Minimal eager browser entry
│   │   ├── card/                  # Lovelace shell and layout renderer
│   │   ├── core/                  # Stable runtime and module contracts
│   │   ├── api/                   # Typed backend client and wire types
│   │   ├── modules/               # Independently loaded UI features
│   │   ├── connections/           # Lazy browser playback adapters
│   │   └── editor/                # Lazily loaded layout editor
│   └── tests/
├── tests/                         # Python and cross-boundary tests
└── scripts/                       # Build, packaging, and validation tools
```

This tree describes ownership locations, not a requirement to create empty
directories or placeholder files. A directory is created when its first real
responsibility is implemented.

### 5.1 Feature package rule

Each frontend module and backend feature receives a stable folder boundary
from its first implementation:

```text
frontend/src/modules/live/index.ts
custom_components/watchzone/features/layouts/__init__.py
```

The first version may be one cohesive implementation file. Additional files
are added inside that boundary only when the feature gains a separate
lifecycle, independently testable policy, or reusable internal concept.
External code imports only the feature's public entry point. Internal files
remain private, so reorganizing a feature does not ripple through the system.

## 6. Dependency and ownership rules

These rules are mandatory:

1. The card shell may depend on `core` and `api`, but not on a module's private
   implementation.
2. A frontend module may depend on public contracts in `core` and `api`.
3. A frontend module must never import another frontend module.
4. A frontend module may use the public connection resolver but must not import
   a concrete live connection adapter.
5. `core` must not import any feature module or concrete connection adapter.
6. Backend API adapters validate transport input, enforce permissions, invoke
   feature services, and serialize results. They do not contain feature logic.
7. Backend features may depend on provider protocols and storage contracts,
   not on concrete provider internals.
8. Providers translate external systems into WatchZone-owned models. Frigate
   response shapes must not leak across the application by default.
9. Storage adapters persist and migrate data. They do not contain UI or
   provider behavior.
10. Circular imports and circular runtime dependencies are prohibited.
11. Shared code must have at least two real consumers, unless it defines an
    external boundary or stable system contract.

Import-boundary checks must be automated when the relevant directories exist.
Code review alone is not sufficient enforcement.

## 7. One integration and one release artifact

The frontend and backend are released in lockstep:

- One integration version identifies the entire release.
- All generated output is isolated beneath repository-root `dist/`. Vite emits
  frontend assets to `dist/frontend/`; release staging assembles the complete
  integration beneath `dist/package/` and produces `dist/watchzone.zip`.
- Packaging copies the built frontend beneath `frontend/` in the assembled
  integration.
- Release validation fails if generated assets are missing or do not match the
  current source build.
- Python registers and serves the packaged frontend assets.
- Python registers the card as an awaited Lovelace module resource only after
  WatchZone is configured and removes its registration cleanly when the
  integration is unloaded. The card must not use `extra_module_url` or
  `add_extra_js_url`; those paths are not ordered ahead of dashboard rendering
  and can lose custom-element registrations during frontend initialization.
- The release must not depend on a separately installed Lovelace resource.
- Frontend/backend compatibility shims are not maintained between WatchZone
  releases.

The source repository uses HACS's standard integration layout:
`custom_components/watchzone/` contains the integration source and
`manifest.json`; `hacs.json` remains at the repository root. WatchZone does not
use HACS `content_in_root`.

Tagged releases use HACS `zip_release` with the filename `watchzone.zip`.
HACS extracts that archive directly into
`<config>/custom_components/watchzone`, so the archive root must contain the
integration files themselves:

```text
watchzone.zip
├── __init__.py
├── manifest.json
├── const.py
├── ...
└── frontend/
    ├── watchzone.js
    └── ... lazy chunks and asset manifest
```

The archive must not contain a wrapping `dist/`, `package/`,
`custom_components/`, or `watchzone/` directory. Repository-root `dist/` is a
local/CI staging convention, not a HACS installation requirement, and is never
committed.

The internal frontend/backend API is still typed and tested because it is a
high-impact boundary. This protects correctness within a release; it is not a
mechanism for supporting mismatched releases.

Persisted user data is different: saved layouts survive upgrades and therefore
must have explicit schema versions and migrations.

### 7.1 Version and commit discipline

`custom_components/watchzone/const.py` is the source of truth for the WatchZone
version through its `VERSION` constant.

- Every commit pushed to `main` is an independently installable HACS test build
  and therefore has a unique `VERSION` and generated GitHub release. During
  prerelease development, increment the prerelease identifier for each such
  commit (for example, `0.0.3-dev.1` to `0.0.3-dev.2`).
- Uncommitted iterations within one handoff keep the same version.
- The version is valid Semantic Versioning.
- `manifest.json`, frontend package metadata, release artifacts, and other
  version-bearing files must match `VERSION`. Automated validation must reject
  drift.
- Patch increments cover fixes, documentation, tests, and internal changes.
  Minor increments cover backward-compatible user-visible capabilities. Major
  increments cover breaking public or persisted-contract changes after 1.0.
- During initial development, intentional breaking changes increment the
  pre-1.0 minor version when appropriate.
- Commit subjects include the version using the format
  `vX.Y.Z - type(scope): summary`.
- Whenever work is handed off for a commit, the handoff includes a proposed
  commit subject containing the exact version.

## 8. Frontend architecture

### 8.1 Eager card shell

The eager entry bundle contains only what is required to register and display
the card shell:

- Custom element registration.
- Lovelace `setConfig` and `hass` lifecycle handling.
- Minimal loading and error surfaces.
- Layout retrieval and validation orchestration.
- The layout renderer.
- Module loader contracts and the compile-time loader map.
- The small typed API client needed to retrieve a layout.

It must not eagerly import:

- Any feature module implementation.
- Any concrete live connection adapter.
- The layout editor.
- Provider-specific UI.
- Large media, timeline, charting, or date libraries.

The shell owns orchestration, not feature behavior.

### 8.2 Mandatory lazy loading

Lazy loading is a first-class architectural requirement, not a later
optimization.

Every user-placeable module is loaded through a native dynamic import:

```ts
const moduleLoaders = {
  live: () => import("../modules/live/index.js"),
  eventList: () => import("../modules/event-list/index.js"),
} satisfies ModuleLoaderMap;
```

The exact syntax may change with the build tool, but these properties may not:

- The eager entry has no static import path to a module implementation.
- A module chunk is requested only when the active layout contains that module.
- Modules needed by a layout load concurrently, not sequentially.
- The editor is a separate dynamic import and is never loaded for normal card
  viewing.
- A live connection adapter is requested only when a visible live module uses
  its connection type.
- Failed imports render a local module error with a retry action.
- Module loaders cache successful promises to prevent duplicate fetches.
- Optional prefetching is allowed only after the visible layout is interactive
  and only when measurement shows a benefit.

Vite must emit an entry asset plus content-hashed chunks. Dynamic-import URLs
must remain relative to the served entry or be resolved through the generated
asset manifest. The stable entry must not be cached longer than the integration
can safely update it; hashed chunks may use immutable caching.

### 8.3 Frontend module contract

A module is a user-placeable unit with a stable type identifier. Its public
entry exports a definition matching the core contract. The contract will begin
with the minimum fields required by the first module and may grow only for a
demonstrated cross-module requirement.

Conceptually:

```ts
interface WatchZoneModuleDefinition<TConfig = unknown> {
  readonly type: string;
  validateConfig(value: unknown): TConfig;
  define(): void;
  createElement(): HTMLElement;
}
```

Module responsibilities:

- Validate its own configuration after structural layout validation.
- Own its rendering, loading, empty, error, and disconnected states.
- Own and release its subscriptions, timers, observers, media objects, and
  abort controllers.
- Expose behavior only through the core module contract.
- Preserve expensive DOM, especially media elements, across unrelated updates.
- Fail locally without preventing sibling modules from rendering.

A module does not own placement, overall navigation, layout persistence, or
another module's state.

### 8.4 Custom elements and Lit

- The card shell and meaningful independently updating module boundaries use
  Lit custom elements.
- A helper is not made into a custom element merely to create a file or claim
  reusability.
- Small templates, pure functions, and private classes remain with their owner.
- Shadow DOM is used for WatchZone element encapsulation.
- Styling uses Home Assistant theme variables with resilient fallbacks.
- Unsupported internal Home Assistant frontend elements are not treated as a
  stable API. If used, they must be isolated behind a small WatchZone adapter.
- Reactive state contains only values that affect rendering.
- Derived data is computed or memoized at the owning boundary rather than
  duplicated into reactive state.

### 8.5 Home Assistant state updates

Home Assistant may assign a new `hass` object for any state change. Therefore:

- The shell may receive the full object but must not broadcast every assignment
  as a general rerender signal.
- Modules declare or derive the entity IDs and HA data they consume.
- Expensive modules update only when a consumed reference or relevant runtime
  state changes.
- Deep comparison or serialization of `hass`, `hass.states`, layouts, or event
  collections is prohibited in render paths.
- The complete `hass` object is not copied into a general application store.
- Context may provide a stable runtime facade; it must not become an
  unrestricted service locator.
- Ordinary parent-child data uses explicit properties.

### 8.6 Card editor, themes, and responsive behavior

Every card configuration field uses Home Assistant's dirty-state editor
lifecycle. Typing updates a local normalized draft and a stable `dirtyState`
context key; it does not repeatedly emit `config-changed` or reconstruct the
preview card. Draft preview uses a coalesced WatchZone-owned path that
preserves component identity. Save hands the final draft to Home Assistant;
Cancel discards it. The normative behavior and required tests are defined in
[docs/config-editor-lifecycle.md](docs/config-editor-lifecycle.md).

WatchZone's editor is a write-only dirty-state consumer and therefore requests
the context once without subscribing to provider publications. A semantic
control commit emits exactly one standard `config-changed` event containing the
complete draft. Home Assistant owns the committed dialog configuration and
Save/Cancel lifecycle; WatchZone does not access private dialog state, protected
methods, Save-button structure, or shadow-DOM implementation details.

WatchZone uses current Home Assistant controls and semantic theme tokens.
Project customization variables use the `--wzc-` prefix and resolve to Home
Assistant tokens by default. Hardcoded application palettes and independent
light/dark assumptions are prohibited.

Every visual boundary is responsive from its first implementation. Use
logical sizing, container-aware rules, bounded fluid values, and explicit
overflow behavior. The card shell is the future constraint boundary for panel
and full-size layouts and must not assume a dashboard column count or viewport.

WatchZone supports current Chrome, Edge, Firefox, and Safari releases, plus
Home Assistant Companion on Android and iOS and Home Assistant clients using
Catalyst. Interfaces must work at phone, tablet, and desktop sizes with touch,
pointer, and keyboard input. Chromium-only behavior, user-agent branching, and
desktop-only interaction assumptions are prohibited. Browser capabilities are
feature-detected at their ownership boundary; an unavailable media capability
produces an explicit fallback or actionable local error rather than breaking
the card. The normative platform and validation matrix is defined in
[docs/platform-compatibility.md](docs/platform-compatibility.md).

### 8.7 Interaction state

Cross-module interaction is mediated by a small typed session store owned by
the card runtime. Examples include selected camera, selected event, or active
navigation target.

- Add a shared field only when two or more modules need it.
- Shared state contains interaction state, not duplicated provider datasets.
- Modules dispatch typed actions and observe narrow selectors.
- Modules never mutate another module's state.
- A generic string-based global event bus is prohibited.
- Session state is scoped to a card instance unless a requirement explicitly
  calls for wider scope.

### 8.8 Live connection adapters

A **provider** and a **live connection type** are different architectural
concepts:

- A provider supplies camera identity, metadata, events, recordings, controls,
  authentication, and provider capabilities. Examples include Frigate and
  MotionEye.
- A live connection adapter turns a normalized source descriptor into browser
  playback. Examples include a Home Assistant camera connection and a
  Frigate/go2rtc connection.

A camera belongs to one provider instance but may expose multiple live source
candidates. For example, a Frigate camera may be viewable through Frigate's
go2rtc endpoint or through a linked Home Assistant camera entity. Layouts and
modules refer to the stable WatchZone camera ID, not directly to a transport
URL.

Conceptually, the backend returns data shaped like:

```ts
interface LiveSourceDescriptor {
  readonly id: string;
  readonly type: "home_assistant" | "frigate_go2rtc";
  readonly capabilities: readonly LiveSourceCapability[];
  readonly parameters: Readonly<Record<string, unknown>>;
}
```

The concrete descriptor schema is a discriminated union, not an unrestricted
parameter bag. Credentials and provider secrets never appear in it.

Connection rules:

- The backend discovers, authorizes, normalizes, and ranks available source
  descriptors.
- The frontend connection resolver selects a compatible source according to
  saved preference, required capabilities, health, and deterministic fallback
  order.
- Each connection type has a stable folder boundary under
  `frontend/src/connections/<type>/` and is loaded with a dynamic import.
- The live module depends only on the public resolver and playback contract.
- Connection adapters own browser media objects and playback-specific cleanup,
  but not camera metadata, layout state, or provider APIs.
- Failure of one source may fall back to the next eligible source without
  changing camera identity.
- Adding a connection type must not require modifying existing modules beyond
  registration in the compile-time loader map.
- Video bytes should flow directly to the browser when security and provider
  behavior permit. Python brokers authorization and source resolution but does
  not proxy high-bitrate media without a concrete need.

### 8.9 Retained media sessions and audio intent

Live connections are owned by a document-scoped media-session manager, not by
a card, module, layout renderer, preview, or editor element. The manager is a
single typed runtime service shared by every WatchZone card instance in the
same Home Assistant browser document.

Mandatory behavior:

- Re-rendering, moving, or temporarily disconnecting a live module does not
  recreate an unchanged live connection.
- Layout and WatchZone view changes transfer presentation attachment while
  retaining the underlying session.
- Pre-editor and editor previews acquire leases on existing sessions rather
  than creating duplicate connections for the same source.
- Navigation elsewhere in Home Assistant retains eligible sessions while the
  same browser document remains alive, subject to explicit connection and
  resource budgets.
- Returning to a dashboard reattaches retained sessions without renegotiation
  when the connection remains healthy.
- Full page reload, browser process termination, network loss, or operating
  system suspension may require reconnection; these are not falsely presented
  as retained sessions.
- Every connection adapter implements the common session, attachment,
  detach/park, health, and close contract required by the manager.
- Retention is bounded. Eviction is deterministic, closes resources fully, and
  prioritizes visible, audible, recently used, and explicitly pinned sessions.

User audio intent is separate from temporary playback state:

- A user's explicit muted or unmuted preference is stored per camera and
  shared across WatchZone card instances for that Home Assistant user and
  browser profile.
- Automatic policies may temporarily force a session silent, but they never
  overwrite the user's preference.
- No automatic behavior may unmute a camera the user explicitly muted.
- When a temporary forced mute ends, the manager restores the user's desired
  state when browser autoplay rules permit.
- Browser autoplay rejection is represented separately from user mute intent.
- Audio-focus rules prevent accidental simultaneous playback without changing
  saved preferences.

The detailed normative lifecycle, lease, retention, eviction, and mute-state
contract is defined in [docs/live-session-lifecycle.md](docs/live-session-lifecycle.md).

## 9. Python-owned layout system

### 9.1 Authority

Python is the authoritative owner of layouts. The frontend editor is a client
of the Python layout API; it does not persist layout definitions in Lovelace.

The Lovelace card configuration contains only presentation metadata and the
minimum identity or initial selection needed to render the card, such as a
title, saved layout ID, card instance ID, or initial camera entity. It must not
contain the module tree, placement rules, or module configuration. The initial
camera selection is a narrow card input that can seed a future Python-owned
layout; it is not a parallel layout definition in Lovelace.

### 9.2 Stored layout model

The persisted model is a versioned WatchZone-owned JSON structure. At minimum,
a saved layout contains:

- Stable layout ID.
- User-visible name.
- Storage schema version.
- Monotonic revision.
- Root layout node.
- Stable node IDs.
- Module type and validated module configuration for module nodes.
- Container placement and responsive behavior for container nodes.
- Creation and modification metadata where useful.

The root is a typed tree of container nodes and module nodes. Container nodes
control placement; module nodes control behavior. Neither is allowed to absorb
the other's responsibilities.

Stored values are declarative data. Arbitrary executable content, unvalidated
URLs containing credentials, raw HTML, and unrestricted CSS are prohibited.

### 9.3 Persistence

Layouts use Home Assistant's typed `Store` helper rather than ad hoc file I/O.

- Storage has major and minor schema versions.
- Every breaking stored-data change supplies a tested forward migration.
- Writes are atomic.
- Serialization work must not block the event loop for large payloads. If
  worker serialization is used, it operates on a thread-safe snapshot and
  never accesses `hass` from the worker.
- Invalid writes are rejected before modifying the last valid stored state.
- A corrupt stored layout cannot prevent the integration from loading other
  valid layouts.
- Layout deletion and renaming have explicit behavior for cards referencing
  the affected ID.

Config-entry `data` and `options` are reserved for integration/provider setup
and small settings. Frequently edited layout documents do not belong there.

### 9.4 Concurrency and subscriptions

- Layout mutations use optimistic concurrency with an expected revision.
- Conflicting writes return a typed conflict error instead of silently
  overwriting another editor session.
- The backend publishes layout-change notifications through an authenticated
  Home Assistant WebSocket subscription.
- Viewing cards update from saved revisions; unsaved editor drafts remain local
  to the editor.
- A mutation is acknowledged only after validation and persistence succeed.

### 9.5 Layout editor

The editor is a lazy frontend feature backed by Python APIs. Python owns
validation, persistence, authorization, and the canonical available-module
metadata. The editor owns interaction and preview presentation.

The editor must eventually support:

- Creating, copying, renaming, and deleting layouts.
- Adding, removing, moving, and configuring modules.
- Responsive placement without predefined "single-view" or "wide-view"
  application modes.
- Saving with revision conflict handling.
- Previewing without mutating the saved layout.

These capabilities do not need to be implemented before the empty card shell,
but the stored model and boundaries must not prevent them.

## 10. Backend architecture

### 10.1 Home Assistant lifecycle

- WatchZone has one primary config entry representing the application.
- Provider connections are configured as typed config subentries beneath the
  WatchZone entry. The user can add, reconfigure, and remove provider instances
  through Home Assistant's UI.
- Multiple provider types and multiple instances of the same provider are
  supported.
- Use a typed `ConfigEntry[WatchZoneRuntime]` and `entry.runtime_data` for
  per-entry runtime objects.
- Domain-global registrations are created once and cleaned up correctly.
- `async_setup_entry` constructs the runtime and delegates to feature setup.
- `async_unload_entry` must release tasks, subscriptions, sessions, and
  providers and support clean reloads.
- Register cleanup callbacks with Home Assistant lifecycle helpers rather than
  relying on object destruction.
- YAML is not used to configure provider connections or layouts.

### 10.2 Runtime composition

`WatchZoneRuntime` is a typed composition container, not a god object. It may
hold references to feature services and provider instances, but it must not
reimplement their behavior or expose unrestricted mutable dictionaries.

Features own their own lifecycle. A central `DataUpdateCoordinator` is used
only when a concrete set of Home Assistant entities genuinely shares one
polling source and refresh schedule. It is not the application architecture.

### 10.3 Async safety

- No blocking network, disk, subprocess, sleep, or CPU-heavy work runs in the
  Home Assistant event loop.
- Use async libraries and Home Assistant clients where available.
- Unavoidable synchronous work uses `hass.async_add_executor_job` or the
  appropriate Home Assistant helper.
- Background tasks are created through Home Assistant task APIs and are owned
  and cancelled by a lifecycle boundary.
- Network calls use explicit timeouts and bounded concurrency.
- Retries use bounded exponential backoff and never form unbounded loops.
- Cancellation is propagated; `CancelledError` is not swallowed.
- Shared mutable state is protected by ownership, immutable snapshots, or an
  appropriately scoped lock.

### 10.4 Provider adapters

External systems are accessed through narrow WatchZone-owned provider
protocols.

- Provider-specific authentication, endpoints, response shapes, and quirks
  remain in the provider adapter.
- Features request domain operations such as listing events or resolving a
  stream, not raw HTTP endpoints.
- Provider responses are normalized once at the boundary.
- A provider does not import frontend or API transport code.
- Provider capabilities are explicit so unsupported operations fail cleanly.
- Provider clients and sessions are reused and closed during unload.

The first provider may be Frigate, but core module, camera, layout, and live
connection contracts must not encode Frigate as the only possible source.

Provider instances are isolated. Failure, reauthentication, or reload of one
provider must not interrupt healthy providers. A WatchZone installation may,
for example, contain two Frigate instances and one MotionEye instance.

### 10.5 Camera catalog and capabilities

The backend exposes one normalized camera catalog across every configured
provider. Each camera has:

- A stable opaque WatchZone camera ID.
- Provider instance ID and provider-native camera ID.
- User-visible metadata.
- Provider capabilities such as events, recordings, snapshots, PTZ, or audio.
- Zero or more normalized live source descriptors.
- Health and availability information that does not replace its stable ID.

Names are not identifiers. Camera IDs remain stable across display-name
changes and cannot collide between provider instances.

Frontend modules consume WatchZone camera models and capability flags. A
generic module must not branch on provider names. Provider-specific modules
are allowed only for genuinely provider-specific behavior and must declare the
required provider capability explicitly.

The camera catalog supports mixed-provider layouts. A live module may show a
MotionEye camera while an event-list module displays Frigate events, and a
camera selector may list cameras from all configured providers.

### 10.6 Aggregation rules

- Cross-provider queries fan out only to providers that advertise the required
  capability.
- Results use WatchZone-owned models and deterministic ordering.
- Pagination remains bounded; cross-provider cursors are opaque to the
  frontend.
- Provider-specific caches, rate limits, and retries remain owned by that
  provider instance.
- Shared aggregation does not create a second unbounded copy of every
  provider dataset.
- Partial failure is represented explicitly so available results can still be
  used without pretending the failed provider succeeded.

## 11. Frontend/backend API

### 11.1 Transport

Use Home Assistant's authenticated WebSocket API for commands, queries, and
subscriptions. Use authenticated HTTP views only when the payload or streaming
semantics make WebSocket unsuitable, such as media byte delivery.

Frontend code uses the `hass` connection through one WatchZone API client.
Feature modules do not construct raw WatchZone WebSocket messages throughout
the UI.

### 11.2 Command contract

Every command or subscription has:

- A namespaced type such as `watchzone/layout/get`.
- Strict backend input validation.
- Explicit TypeScript request and response types.
- Authentication and the narrowest appropriate authorization check.
- Stable, machine-readable error codes and user-safe messages.
- JSON-serializable payloads.
- Tests covering valid, invalid, unauthorized, and failure paths.

Because frontend and backend ship together, API changes update both sides in
the same change. Old internal command shapes are removed rather than retained
as compatibility layers, unless an in-flight runtime transition demonstrably
requires otherwise.

### 11.3 API responsibilities

- Read operations may be available to authenticated non-admin users when they
  expose only data the user is authorized to see.
- Layout create, update, and delete operations require administrator access by
  default.
- Provider credentials and secrets never cross into frontend payloads.
- Live source descriptors contain only the minimum authorized information
  needed by the selected connection adapter.
- Errors are translated at the appropriate user-facing boundary and do not
  expose stack traces or secret-bearing upstream responses.
- Large collections use cursor pagination or bounded windows.
- Subscriptions send deltas or revision notifications rather than repeatedly
  sending full unbounded datasets.

## 12. Error isolation and recovery

Failures are contained at their owner boundary:

- The card shell handles layout-load and top-level runtime failures.
- The layout renderer handles invalid or unknown node types with local
  placeholders.
- A module handles its own data, rendering, and import failures.
- The API client normalizes transport failures.
- Backend API adapters translate feature exceptions into typed API errors.
- Provider adapters translate external failures into WatchZone exceptions.

Unknown module types remain represented in a layout and display an actionable
placeholder. They must not be silently deleted during load or save.

Retry actions must be safe and idempotent where possible. Automatic retries
must be bounded and must stop when a component disconnects.

Errors are translated once at the boundary that can add useful context. Do not
scatter duplicate `try`/`catch` blocks, silently swallow failures, or log and
rethrow the same error at every layer. Expected failures use typed categories
and actionable user-safe messages; unexpected failures retain their cause for
diagnostics without exposing secrets.

The browser console shows one startup banner with application name and version.
Routine state changes, renders, and successful requests are not logged. Runtime
diagnostics eventually flow through one small logging service with levels,
redaction, and duplicate/rate control. Production defaults to actionable
warnings and errors; temporary direct `console` tracing must not remain in a
completed change.

## 13. Performance contract

### 13.1 Bundle and loading budgets

- Initial production JavaScript is the shell, shared runtime, and layout API
  path only.
- The initial entry target is at most **50 KiB gzip**, excluding source maps.
- Each feature chunk has a documented budget when introduced. A budget
  increase requires measured justification in the change that increases it.
- The editor and unused modules contribute zero transferred bytes during
  normal card viewing.
- Unused live connection adapters contribute zero transferred bytes.
- Source maps are not included in the default release artifact unless the
  release process explicitly calls for them.
- CI records asset sizes and fails on budget regressions.

Budgets may be revised through an explicit architecture decision supported by
measurements; they must not drift silently.

### 13.2 Rendering and memory

- Unrelated HA state changes do not rerender expensive module content.
- Render functions perform no network I/O and no unbounded collection work.
- Stable keys preserve module and list item identity.
- Large or growing lists are windowed or virtualized before they become a
  measurable interaction problem.
- Resize and intersection observation is scoped and disconnected correctly.
- Hidden or removed modules release streams, object URLs, subscriptions,
  timers, workers, and observers when their retained session lease and manager
  retention policy no longer require them.
- Media elements are preserved across ordinary state changes and recreated
  only when their media identity or playback contract changes.
- High-frequency events are sampled, coalesced, or scheduled once per frame.
- Layout measurement avoids forced read/write/read cycles.
- Retained sessions have explicit count, bandwidth, decoder, and memory
  budgets; retention must not become an unbounded background resource leak.

### 13.3 Network and backend efficiency

- Identical concurrent requests are deduplicated at the owning feature.
- Caches have explicit ownership, keys, bounds, invalidation, and lifetime.
- Do not cache merely because data might be reused.
- Provider concurrency is bounded.
- Event and timeline queries are paginated and cancellable.
- Push/subscription data is preferred when the provider and HA lifecycle make
  it reliable; polling intervals belong to the feature that owns the data.
- Backend responses include only data needed for the operation.

Performance work is evidence driven. Profiling and bundle analysis precede
complex optimization, but the lazy-loading and update-isolation rules above
are mandatory from the first implementation.

## 14. Configuration and migration

There are three different forms of configuration and they must remain
separate:

1. **Integration/provider configuration:** A primary Home Assistant config
   entry and provider subentry flows; credentials and connection settings
   belong here.
2. **Saved layouts:** Versioned Home Assistant `Store` data owned by Python.
3. **Card reference:** Minimal Lovelace config used to select a saved layout or
   card instance; no layout tree belongs here.

Every persisted schema has an explicit owner and migration path. Migration
tests use real fixtures from prior schema versions. Code must not scatter
fallback reads for old fields throughout normal runtime logic.

## 15. Security and privacy

- Trust Home Assistant authentication; never invent a parallel authentication
  mechanism.
- Enforce permissions on the backend even when the frontend hides an action.
- Secrets remain in config-entry data or the appropriate HA credential store.
- Secrets, bearer tokens, signed media URLs, and credential-bearing provider
  responses must not be logged.
- Layout/module validation rejects executable or unsafe values.
- HTTP media views validate authentication, authorization, identifiers, and
  ranges and use appropriately short-lived signed access when required.
- User-supplied text is rendered as text, not injected HTML.
- External URLs are normalized and validated before use.
- Debug logging is opt-in and redacts sensitive fields.

## 16. Testing contract

Tests protect contracts and behavior, not implementation trivia.

Required layers as their corresponding features appear:

- Pure unit tests for layout validation, migrations, selectors, normalization,
  and feature policy.
- Lit component tests for lifecycle, missing data, cleanup, and local failure
  isolation.
- Lazy-loading tests proving unused module and editor chunks are absent from
  initial loading.
- Connection-adapter contract tests covering selection, fallback, cleanup, and
  proof that unused adapters are absent from initial loading.
- Media-session lifecycle tests covering lease transfer, card disconnection,
  view/editor transitions, Home Assistant route changes, eviction, reconnect,
  mute persistence, forced mute, audio focus, and autoplay rejection.
- Backend tests using Home Assistant fixtures for setup, unload, permissions,
  storage, migrations, WebSocket commands, and subscriptions.
- Contract fixtures exercised by both Python serialization tests and
  TypeScript parsing tests for high-impact payloads.
- Build tests verifying the asset manifest, dynamic-import paths, content
  hashes, and release package contents.
- A small end-to-end smoke path for Home Assistant loading the packaged card.
- Browser-visible behavior runs against Chromium, Firefox, and WebKit. This
  engine matrix supplements, but does not replace, milestone testing in Chrome,
  Edge, Firefox, Safari, Home Assistant Companion on Android and iOS, and a
  Catalyst-based Home Assistant client.
- Responsive component coverage includes representative phone, tablet, and
  desktop containers and both touch/coarse-pointer and mouse/keyboard paths
  when the feature has interactive behavior.
- Performance checks for eager bundle size and any feature-specific critical
  budget.

Snapshot tests must not replace behavioral assertions. Tests may not require
live internet services; provider I/O is exercised through controlled fakes or
fixtures.

## 17. File and abstraction discipline

- Do not create placeholder files, empty directories, or speculative classes.
- Start a feature with the fewest files consistent with its stable package
  boundary.
- Keep feature-specific types, styles, parsers, and helpers with the feature.
- Split code when it gains a separate responsibility or lifecycle, not at an
  arbitrary line count.
- Do not create an interface for every class. Interfaces and protocols protect
  boundaries, multiple implementations, or tests that need a real seam.
- Do not create generic `helpers`, `common`, or `utils` dumping grounds.
- A helper used once remains private to its owner.
- Public barrel files exist only at intentional package boundaries. Internal
  code imports concrete local files.
- A refactor that replaces a path removes the old path in the same change
  unless a documented migration requires it.
- No commented-out implementations, unused exports, or compatibility aliases
  remain after a completed change.
- Generated frontend assets are never manually edited.
- Keep implementations cohesive and compact. Line count is not a target, but
  repeated ceremony, parallel code paths, and pass-through layers are defects.
- Extract a helper when behavior has multiple real consumers, protects a
  stable boundary, or is required by a concrete near-term capability already
  in this contract. Do not wait for the same logic to be copied repeatedly.
- Use a controller or handler when it owns orchestration, an event boundary, or
  a lifecycle. Keep policy in its owning feature and prevent controllers from
  becoming general-purpose god objects.
- Prefer a class when identity, encapsulated mutable state, lifecycle cleanup,
  or multiple implementations make it clearer or more efficient. Prefer plain
  functions and immutable data for stateless transformations. A known next
  expansion may influence the choice; hypothetical flexibility alone may not.
- Centralize validation, error translation, and cleanup patterns at their
  natural boundary instead of repeating defensive boilerplate at every call
  site.

## 18. Change discipline

The stable boundaries in this document are chosen to prevent avoidable
cross-project refactors. Internal implementation is allowed to improve without
changing those boundaries.

An architecture decision is required before changing any of the following:

- Dependency direction.
- Stable repository roots.
- Python ownership of saved layouts.
- Module isolation rules.
- Mandatory lazy-loading behavior.
- Release-as-one-integration strategy.
- Separation of providers from live connection adapters.
- Document-scoped retained media-session ownership and user audio-intent rules.
- Dirty-state card-editor lifecycle and identity-preserving preview updates.
- Home Assistant semantic theming and responsive shell requirements.
- Storage format ownership.
- Authentication or authorization model.
- Performance budgets.

An architecture change must document the problem, evidence, alternatives,
migration impact, and decision. Convenience alone is not sufficient.

## 19. Initial implementation sequence

The architecture is established now, but implementation remains incremental:

1. Create the minimal Python integration, config flow, typed runtime, clean
   unload path, and packaged frontend asset registration.
2. Register an empty `watchzone-card` shell with minimal Lovelace lifecycle
   handling and an empty theme-compatible container.
3. Establish hashed chunk output, the asset manifest, Python static serving,
   HACS packaging, and release validation as one integration artifact.
4. Add the layout API and a minimal stored empty layout.
5. Add the lazy module loader and prove with a trivial first module that it is
   excluded from the eager entry.
6. Add the first provider package, normalized camera catalog, and provider
   subentry flow.
7. Add the live module plus one lazy connection adapter, then add other
   connection types independently.
8. Add the lazy editor only when layout creation work begins.
9. Add further providers and feature modules vertically, one user-visible
   capability at a time.

Each step must leave the repository releasable, tested, and free of parallel
temporary architectures.

## 20. Definition of done for every change

A change is complete only when:

- Ownership and dependency direction match this contract.
- Async work is lifecycle-owned and cancellable.
- New frontend code loads only when needed.
- Unrelated HA state does not trigger avoidable expensive work.
- Inputs are validated at trust boundaries.
- Errors are contained and actionable.
- Resources are released when lifecycle ownership and retained-session policy
  end, or when the integration unloads.
- Live sessions and mute state follow the retained-session lifecycle contract.
- Every card configuration field follows the editor lifecycle contract.
- Visual changes use Home Assistant theme tokens and remain responsive.
- Tests cover the changed contract and important failure paths.
- Generated output and documentation are updated when applicable.
- Replaced code and dead paths are removed.
- Bundle and runtime performance remain within budget.

## 21. Authoritative platform references

WatchZone follows supported Home Assistant APIs and current project guidance,
including:

- Home Assistant WebSocket extension API:
  <https://developers.home-assistant.io/docs/frontend/extending/websocket-api>
- Home Assistant integration development:
  <https://developers.home-assistant.io/docs/creating_component_index/>
- Home Assistant authentication and long-lived storage helpers as provided by
  the supported Core version.
- Home Assistant integration quality rules:
  <https://developers.home-assistant.io/docs/core/integration-quality-scale/>
- Home Assistant custom card and editor guidance:
  <https://contributors.home-assistant.io/frontend/custom-ui/card/>
  and <https://contributors.home-assistant.io/frontend/custom-ui/card-editor/>
- Home Assistant frontend theming:
  <https://contributors.home-assistant.io/frontend/architecture/theming/>

When platform behavior changes, implementation and this contract must be
updated together. Unsupported frontend internals are not made architectural
dependencies merely because they are currently available.
