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
companion cameras, and navigation controls. User-created layouts are created
and persisted through the Python integration. Immutable built-in Stage Design
templates ship with the frontend; both sources validate into the same
versioned schema and use the same renderer. Lovelace YAML references ordered
Stage Design IDs but does not contain a layout definition.

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
          +------ dynamic import ------> Provider capability adapters
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
          +----------------------------> Provider capability registry
                                                   |
                                                   +--> Built-in adapters
                                                   |
                                                   +--> Companion integrations
```

Dependencies flow downward in this diagram. A lower layer must not import or
call into a higher layer.

## 5. Repository structure

The following roots are stable. New top-level source roots require an
architecture decision recorded in this document or a future ADR.

```text
.
├── architecture.md
├── ROADMAP.md                      # Living future-capability reference
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
│       ├── extensions.py          # Versioned backend extension boundary
│       ├── api/                   # HA WebSocket/HTTP boundary adapters
│       ├── features/              # Backend use cases grouped by feature
│       ├── providers/             # Built-in provider contracts and adapters
│       ├── storage/               # Versioned persisted-data adapters
│       ├── translations/
│       └── frontend/              # Generated release assets only
├── frontend/
│   ├── src/
│   │   ├── main.ts                # Minimal eager browser entry
│   │   ├── card/                  # Lovelace shell and layout renderer
│   │   ├── core/                  # Stable runtime and placeable contracts
│   │   ├── api/                   # Typed backend client and wire types
│   │   ├── modules/               # Independently loaded UI features
│   │   ├── components/            # Portable placeables for module slots
│   │   ├── providers/             # External-system capabilities and resolver
│   │   ├── ui/                    # Shared visual primitives and icon registry
│   │   ├── styles/                # HA theme boundary and global design tokens
│   │   └── editor/                # Lazily loaded layout editor
│   └── tests/
├── tests/                         # Python and cross-boundary tests
└── scripts/                       # Build, packaging, and validation tools
```

This tree describes ownership locations, not a requirement to create empty
directories or placeholder files. A directory is created when its first real
responsibility is implemented.

### 5.1 Feature package rule

Each frontend placeable and backend feature receives a stable folder boundary
from its first implementation:

```text
frontend/src/modules/camera/index.ts
frontend/src/components/two-way-talk/index.ts
custom_components/watchzone/features/layouts/__init__.py
```

The first version may be one cohesive implementation file. Additional files
are added inside that boundary only when the feature gains a separate
lifecycle, independently testable policy, or reusable internal concept.
External code imports only the feature's public entry point. Internal files
remain private, so reorganizing a feature does not ripple through the system.

### 5.2 Frontend feature architecture

The frontend uses feature-based vertical slices with unidirectional data flow
and selective controllers. It does not impose application-wide MVP or MVVM.
Lit reactive properties already provide the simple view-model function; adding
a presenter or view-model class without separate policy or lifecycle is
prohibited ceremony.

Within a feature:

- `index.ts` is the public/lazy entry and composition boundary.
- A Lit element file renders state, accepts properties, and emits typed user
  intents. It does not own provider, transport, or persistence behavior.
- Every Lit element's CSS lives in a colocated `*.styles.ts` file. Behavior
  files must not contain `css` template literals.
- A `*.controller.ts` file is added only when orchestration, subscriptions, or
  lifecycle have become a distinct responsibility.
- A `*.model.ts` or `*.types.ts` file is added only when substantial pure
  policy or a separately owned contract exists.
- State and configuration flow down. Typed intents and events flow up.
- Files are not created merely to fill out the pattern.

Stable cross-feature contracts and document-scoped services belong in `core/`.
Feature behavior does not. Provider capabilities remain outside UI features
behind their public resolver boundaries.

## 6. Dependency and ownership rules

These rules are mandatory:

1. The card shell may depend on `core` and `api`, but not on a module's private
   implementation.
2. A frontend module may depend on public contracts in `core` and `api`.
3. A frontend module must never import another frontend module.
4. A frontend module may use a public provider resolver but must not import a
   concrete provider or provider-capability implementation.
5. `core` must not import any feature module, provider, or concrete playback
   adapter.
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

- Every release-affecting commit pushed to `main` is an independently
  installable HACS test build and therefore has a unique `VERSION` and
  generated GitHub release. During prerelease development, increment the
  prerelease identifier for each such commit (for example, `0.0.3-dev.1` to
  `0.0.3-dev.2`).
- Commits limited to documentation, tests, or workflow maintenance run the
  validation workflow without publishing another HACS release and keep the
  current application version.
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
- The release workflow retains the five newest GitHub prereleases and removes
  older prerelease tags and releases after a successful publish. Stable
  releases are never pruned. The retention count is a named workflow constant.

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
- Any concrete provider-capability or playback adapter.
- The layout editor.
- Provider-specific UI.
- Large media, timeline, charting, or date libraries.

The shell owns orchestration, not feature behavior.

### 8.2 Mandatory lazy loading

Lazy loading is a first-class architectural requirement, not a later
optimization.

Every user-placeable module and component is loaded through a native dynamic
import:

```ts
const moduleLoaders = {
  camera: () => import("../modules/camera/index.js"),
  eventList: () => import("../modules/event-list/index.js"),
} satisfies PlaceableLoaderMap;

const componentLoaders = {
  twoWayTalk: () => import("../components/two-way-talk/index.js"),
  ptz: () => import("../components/ptz/index.js"),
} satisfies PlaceableLoaderMap;
```

The exact syntax may change with the build tool, but these properties may not:

- The eager entry has no static import path to a placeable implementation.
- A placeable chunk is requested only when the active layout contains it.
- Placeables needed by a layout load concurrently, not sequentially.
- The editor is a separate dynamic import and is never loaded for normal card
  viewing.
- A provider live adapter is requested only when a visible camera presentation
  uses its source type.
- Failed imports and invalid placeable configuration report through the shared
  card toast overlay. They never render inline error text or retry controls over
  Stage content. A later lifecycle or configuration sync may retry the failed
  load through the placeable loader.
- Module loaders cache successful promises to prevent duplicate fetches.
- Optional prefetching is allowed only after the visible layout is interactive
  and only when measurement shows a benefit.

Vite must emit an entry asset plus content-hashed chunks. Dynamic-import URLs
must remain relative to the served entry or be resolved through the generated
asset manifest. The stable entry must not be cached longer than the integration
can safely update it; hashed chunks may use immutable caching.

### 8.3 Frontend placeable contract

A module or component is a user-placeable unit with a stable type identifier.
Its public entry exports a definition matching the core placeable contract. The
contract begins with the minimum fields required by the first placeables and may
grow only for a demonstrated cross-placeable requirement.

Conceptually:

```ts
interface WatchZonePlaceableDefinition<TConfig = unknown> {
  readonly type: string;
  validateConfig(value: unknown): TConfig;
  define(): void;
  createElement(): HTMLElement;
}
```

Placeable responsibilities:

- Validate its own configuration after structural layout validation.
- Own its rendering, loading, empty, error, and disconnected states.
- Own and release its subscriptions, timers, observers, media objects, and
  abort controllers.
- Expose behavior only through the core placeable contract.
- Preserve expensive DOM, especially media elements, across unrelated updates.
- Fail locally without preventing sibling placeables from rendering.

A placeable does not own placement, overall navigation, layout persistence, or
another placeable's state. When several modules share one placement, the Stage
renderer may compose them in a typed module stack that owns only the ordered
selection controls and active-child lifecycle.

A **module** is a major Stage content system. It may publish semantic slots
named `content`, `overlay`, `controls`, or `footer`. Camera and the future events
surface are modules. A **component** is a portable capability presentation
placed in a compatible module slot. PTZ and two-way talk are components. A
**container** owns logical grid placement and no feature behavior. A
**presentation** is private rendering inside its owner; camera live video is a
camera presentation rather than another placeable.

The generic **panel module** is the Stage placement surface for a standalone
component. It owns only its grid-sized surface and `content` slot: it does not
absorb the component's behavior or styling. This keeps components off the raw
Stage while allowing the same component to move between a panel and another
module's compatible slot. A camera switcher is therefore one portable
component, whether presented beneath Camera in a panel or later inside a
camera overlay.

Modules and components never import one another or another placeable of their
own kind. Composition belongs to the Stage renderer through stable core
contracts and typed runtime context. Moving a component to another compatible
slot must not require changing its provider transport.

The camera module is a composition boundary, not a monolithic media player. It
owns the active camera and presentation choice while composing an internal
single-camera live presentation, a control overlay, and a non-control
information overlay. Presentation types such as a future carousel reuse the
same internal single-camera presentation contract. Overlay controls dispatch
typed intent and do not own connection adapters or duplicate media-session
policy. A capability that must be independently placed or restyled by the
Stage Designer, such as two-way talk or PTZ, is a component. It consumes only
the card-owned active-camera session context and cannot import camera internals.

Transient interaction-overlay visibility belongs to a Lit reactive controller
within the camera feature. Pointer hover, touch, and keyboard focus share that
policy; behavioral delays are named constants rather than literals embedded in
views or styles. The source indicator remains an independent non-control
overlay, but after its exceptions it consumes the same interaction visibility
state and hide timer as the control overlay. Its exceptions are that Connecting
remains visible continuously and the first resolved source receives one
automatic timed introduction before ordinary interaction-controlled behavior.

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
the context once without subscribing to provider publications. Dirty state only
tracks unsaved work; it does not transport the draft into Home Assistant's card
configuration. To preserve preview component identity, one isolated Home
Assistant editor bridge commits the complete draft immediately before Home
Assistant handles Save. It feature-detects the narrow dialog boundary and falls
back to the public `config-changed` event when that boundary is unavailable. No
other code accesses dialog internals, Save-button structure, or editor-preview
host styling. The same bridge may apply a reversible, feature-detected preview
width compatibility property when Home Assistant's default cap prevents the
large dialog from using its available preview pane.

Every editor control must round-trip all meaningful values through local
draft, dirty state, preview, Save, and reopen. In particular, boolean `false`
is an explicit value and must not be collapsed into a missing property while a
draft is normalized or published. Regression tests cover both directions and
reverting a control before Save.

WatchZone uses current Home Assistant controls and semantic theme tokens.
Project customization variables use the `--wzc-` prefix and resolve to Home
Assistant tokens by default. Hardcoded application palettes and independent
light/dark assumptions are prohibited.

`frontend/src/styles/theme-tokens.ts` is the only frontend file allowed to
consume Home Assistant theme variables directly. It maps them to WatchZone
semantic tokens for primary, primary-dark, accent, surfaces, four text roles
(primary, secondary, tertiary/disabled, and reversed), error, warning, success,
borders, fills, radius scale, shadow scale, typography, card surfaces, and
media overlays. Component styles consume `--wzc-*` tokens only. A new visual
semantic state defines or reuses a WatchZone token before feature CSS uses it.
The write-only `frontend/src/styles/home-assistant-card-bridge.ts` is the sole
exception: it may assign Home Assistant's card-radius and card-shadow host
hooks so appearance options cross HA's shadow-DOM boundary, but it must not
consume those tokens or expose them to features. Automated validation rejects
direct HA-token access outside these boundaries and rejects Lit CSS embedded
in behavior files.

Card-shell appearance and module appearance are independent. The card owns
`--wzc-card-radius` and `--wzc-card-outer-shadow`; the single-camera live
presentation owns `--wzc-live-radius` and `--wzc-live-shadow`. Card-level
toggles must not rewrite module-level tokens. The shadow scale exposes
`--wzc-shadow-small` and `--wzc-shadow-medium`, mapped centrally to Home
Assistant's small and medium shadow tokens. The durable camera presentation
input selects `medium`, `small`, or `none`; temporary boolean controls map into
that typed choice rather than becoming the component contract.

`frontend/src/core/yaml-config.ts` is the persistence boundary for Lovelace
YAML. Runtime and editor state remain fully normalized, while dirty-state,
Save, and compatibility-event outputs pass through this manager so known
default values are never written to YAML. Non-default values and unknown Home
Assistant-owned configuration are preserved.

Lovelace appearance toggles introduced during early development are
provisional authoring controls, not the long-term ownership boundary. Durable
appearance semantics belong to typed component inputs and `--wzc-*` tokens.
The future Python-owned layout designer may replace these temporary controls
and supply the same component inputs; feature styling must not depend on the
temporary editor surface or duplicate its configuration path.

Icons are rendered from the typed registry in `frontend/src/ui/icons.ts`.
Standard actions use the same filled Material Design/MDI geometry expected in
Home Assistant. Feature code may not scatter ad hoc SVG markup or inject SVG
HTML strings. A custom path is allowed only when the default set has no
appropriate icon or the design contract explicitly requires it, such as the
camera Picture-in-Picture pop-out icon. The registry renders owned SVG markup
directly so card behavior does not depend on private Home Assistant elements.

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
- The active-camera context exposes only the identity and interaction handles
  independently placeable camera-control components require. It may reference a
  retained incoming stream and typed mute intent, but never provider clients,
  credentials, layout state, or camera implementation objects.

### 8.8 Provider capabilities and live source resolution

A **provider** and a **live transport** are different concepts, but both are
owned beneath the provider boundary that can perform the capability:

- A provider supplies camera identity, metadata, events, recordings, controls,
  authentication, and provider capabilities. Examples include Frigate and
  MotionEye.
- A provider capability performs one provider-specific operation such as live
  playback, PTZ, two-way talk, events, or recordings. A live capability may
  contain separate browser transport adapters such as WebRTC, MSE, or HLS.

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

Provider and live-resolution rules:

- The backend discovers, authorizes, normalizes, and ranks available source
  descriptors.
- The frontend live-source resolver selects a compatible source according to
  saved preference, required capabilities, health, and deterministic fallback
  order.
- Each external system has one stable folder under
  `frontend/src/providers/<provider>/`. Capabilities are nested beneath it,
  for example `providers/home-assistant/live/`; PTZ and talk transports belong
  beside `live/`. A user-placeable capability presentation may be a component,
  but provider signaling and media mechanics never belong in that component.
- Camera is the user-placeable module. Its `live/` folder is a private camera
  capability and presentation, not another application module. Additional
  independently placeable capability presentations are components composed by
  Stage slots, not camera internals or parallel application modules.
- Feature modules depend only on public provider resolvers and stable capability
  contracts. They never import `providers/<provider>/...` directly.
- Provider live adapters own browser media objects and playback-specific
  cleanup, but not camera presentation, layout state, or module UI.
- Failure of one source may fall back to the next eligible source without
  changing camera identity.
- Adding a provider or transport extends provider resolution without adding a
  parallel camera module or changing existing provider implementations.
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
- Only the selected camera acquires frontend transport leases. Selecting a
  camera starts it immediately or reuses its healthy retained session; it does
  not wait behind background camera startup. Backend HLS pre-warming is a
  separate server policy and does not create browser transports.
- Retention policy groups transport sessions by provider-neutral logical
  camera identity and selects one of two centralized profiles. `standard`
  provides document-lifetime retention within the global session budget and
  applies to desktop, tablet, and phone clients by default. On phone clients,
  confirmed cellular service or the browser's data-saving signal selects
  `reduced_bandwidth`: at most three logical cameras remain connected in
  total, inactive cameras expire after two minutes, and eviction is least
  recently used. Missing network information does not by itself reduce phone
  retention. The card-level Mobile Data Saving option forces
  `reduced_bandwidth` on phone clients. Future device classes map into these
  profiles instead of creating provider- or transport-specific policies.
  Cameras using different providers or connection types participate in the
  same logical-camera budget while each provider independently owns its
  session implementation.
- Physical client type and Home Assistant host-application identity come from
  one document-scoped client profile. They never derive from a card or module
  width. Container-responsive presentation classes remain separate and may not
  select phone retention or phone-specific startup-audio policy.
- Active leases remain protected across background tabs. Home Assistant route
  and dashboard navigation releases element leases into the centralized
  retention policy; returning consumers reuse a healthy retained session.
- Full page reload, browser process termination, network loss, or operating
  system suspension may require reconnection; these are not falsely presented
  as retained sessions.
- Every connection adapter implements the common session, attachment,
  detach/park, health, and close contract required by the manager.
- Retention is bounded. Eviction is deterministic, closes resources fully, and
  prioritizes visible, audible, recently used, and explicitly pinned sessions.

User audio intent is separate from temporary playback state:

- A user's explicit muted or unmuted preference is stored per camera and
  shared across WatchZone card instances for the lifetime of the current Home
  Assistant browser document. It survives route changes, background tabs, and
  window minimization but resets on a hard refresh or new browser document.
- Per-camera startup defaults may differ between phone and tablet/desktop
  presentation classes. They apply only when no document-lifetime user
  preference exists.
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
- Module type, validated module configuration, and semantic component slots for
  module nodes.
- Ordered module-stack nodes that share one placement and expose one child at a
  time without allowing child modules to import or control one another.
- Component type, validated component configuration, and optional logical
  control-region placement for component nodes.
- Logical grid placement and responsive behavior for container nodes.
- Explicit fractional or intrinsic-content sizing for each logical grid row.
- Required `default` and `phone` responsive variants whose corresponding nodes
  reuse stable IDs.
- Creation and modification metadata where useful.

The root is a typed grid container whose placements contain module nodes or
module-stack nodes. Module stacks own navigation between ordered child modules
and no feature behavior. Module nodes may publish typed component slots.
Containers control placement, modules control major content behavior, and
components control portable capability presentation. None may absorb another
category's responsibility.

The normative version-1 schema and runtime rules are defined in
[docs/stage-layout-system.md](docs/stage-layout-system.md).

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

### 10.5 Backend extensions

WatchZone supports independently installed backend extensions without making
feature services depend on external packages or on WatchZone's private module
layout. The initial extension point is provider capabilities; additional areas
may add their own extension points when a real use case exists.

- `custom_components.watchzone.extensions` is the narrow, versioned public
  Python contract. An external integration imports only this surface, declares
  WatchZone as a Home Assistant dependency, registers during setup, and
  unregisters through its config-entry unload lifecycle.
- Registration uses a stable provider ID, optional Home Assistant entity
  platform aliases, an exact extension API version, and explicit capability
  objects. Registration is eager during backend setup so incompatibilities fail
  early. Network clients, sessions, and external work remain demand-driven and
  lifecycle-owned by the capability that needs them.
- Built-in and external providers use the same registry. Features resolve a
  capability from the registry and never construct an import path, import a
  concrete provider, or branch on a provider name.
- A registration owns its identifiers. Duplicate provider IDs or entity
  platforms and incompatible API versions fail explicitly; an add-on cannot
  silently replace a built-in or another add-on.
- Registration returns idempotent cleanup. Unloading an extension prevents new
  capability resolution without invalidating resources already owned by an
  active, separately managed session.
- Extension failures remain isolated to that provider and capability. Core
  fallback behavior must remain available where the feature contract defines
  one.
- Public extension models contain no provider credentials, clients, or mutable
  WatchZone runtime objects. Provider authentication and secrets stay owned by
  the registering integration.
- New extension areas receive a typed, purpose-specific contract and lifecycle;
  WatchZone does not expose a generic service locator, unrestricted runtime
  dictionary, arbitrary import hook, or frontend-code injection mechanism.

In Home Assistant terminology these are companion custom integrations, not
Supervisor add-ons. Installation, trust, dependency declaration, and version
compatibility remain explicit. The core integration does not download or
execute third-party Python code itself.

The current entity-platform aliases support capabilities attached to existing
Home Assistant camera entities. Future provider-owned catalogs and config
subentries resolve by stable provider and instance identity; they must not
manufacture duplicate Home Assistant camera entities merely to participate in
the extension registry.

### 10.6 Camera catalog and capabilities

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

### 10.7 Aggregation rules

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
   entry plus typed subentries for integration-owned settings and provider
   instances; credentials, connection settings, and bounded shared-backend
   policies belong here. Each setting has one persisted owner and one runtime
   read path; an options-flow copy must not coexist with a subentry.
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
- Separation of provider capabilities from browser transport mechanics.
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
2. Register the empty card shell from the centralized internal identity with
   minimal Lovelace lifecycle handling and an empty theme-compatible
   container.
3. Establish hashed chunk output, the asset manifest, Python static serving,
   HACS packaging, and release validation as one integration artifact.
4. Add the layout API and a minimal stored empty layout.
5. Add the lazy module loader and prove with a trivial first module that it is
   excluded from the eager entry.
6. Add the first provider package, normalized camera catalog, and provider
   subentry flow.
7. Add the camera module's private live presentation plus one lazy provider
   live adapter, then add other providers or transports behind the same
   resolver contract.
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
