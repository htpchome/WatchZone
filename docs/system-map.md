# Implemented System Map

## 1. Purpose

This is the durable entry point for understanding WatchZone between sessions.
It maps each implemented system to its owner, normative documentation, runtime
flow, and verification. Read the relevant row and linked contract before
tracing source code.

This map describes the current implementation only. `architecture.md` defines
project-wide boundaries and `ROADMAP.md` describes future pressure; neither is
a substitute for the implemented-system contracts below.

## 2. Maintenance rule

Creating or changing a system requires updating its focused contract and this
map in the same change when ownership, lifecycle, state flow, invariants,
fallbacks, diagnostics, or integration boundaries change. Superseded behavior
is removed rather than retained as historical commentary.

A focused system contract records:

- Purpose and stable ownership boundary.
- Entry points and important collaborators.
- State and event flow.
- Invariants and decisions that callers may rely on.
- Failure, fallback, cleanup, and retention behavior.
- Supported extension points and prohibited coupling.
- Diagnostics and the tests that verify the contract.

## 3. Current systems

### 3.1 Client environment

- **Owner:** `frontend/src/core/client-environment.ts`
- **Contract:** `docs/platform-compatibility.md`, sections 2 and 5
- **Consumers:** card prewarming, camera startup-audio policy, transport
  eligibility, and camera-control device matrices
- **Flow:** one document-scoped `ClientEnvironment` class normalizes browser
  evidence into host, operating system, physical client class, input evidence,
  and derived WebRTC eligibility. Responsive sizing remains CSS-owned.
- **Key invariant:** no other frontend source parses UA, platform, or physical
  device evidence. ESLint enforces this boundary.
- **Verification:** `frontend/tests/client-environment.test.ts` and the Catalyst
  case in `frontend/tests/browser/smoke.spec.ts`

### 3.2 Card configuration, YAML compaction, and editor lifecycle

- **Owners:** `frontend/src/core/config.ts`,
  `frontend/src/core/yaml-config.ts`, `frontend/src/editor/dirty-state.ts`, and
  `frontend/src/editor/card-editor.ts`
- **Contract:** `docs/config-editor-lifecycle.md`
- **Flow:** saved configuration is normalized into a complete runtime model;
  editor controls update a local draft and soft preview; Save commits the full
  draft; YAML output removes values equal to defaults.
- **Key invariant:** input does not emit repeated `config-changed` events or
  reconstruct the preview tree. Boolean values must round-trip through their
  defaults without losing dirty state.
- **Verification:** `frontend/tests/config.test.ts`,
  `frontend/tests/yaml-config.test.ts`,
  `frontend/tests/card-editor.test.ts`, and editor cases in
  `frontend/tests/browser/smoke.spec.ts`

### 3.3 Card shell, appearance, and Home Assistant theme bridge

- **Owners:** `frontend/src/card/card.ts`,
  `frontend/src/card/card.styles.ts`,
  `frontend/src/styles/theme-tokens.ts`, and
  `frontend/src/styles/home-assistant-card-bridge.ts`
- **Contract:** `architecture.md`, sections 8.5 and 8.6;
  `docs/config-editor-lifecycle.md`, section 5
- **Flow:** normalized card configuration drives WatchZone semantic tokens and
  the narrow bridge that synchronizes outer appearance with Home Assistant's
  card host and shadow boundary.
- **Key invariant:** feature CSS consumes `--wzc-*` semantics; only
  `theme-tokens.ts` directly references Home Assistant theme variables.
- **Verification:** `frontend/tests/card.test.ts`, shell and token
  cases in `frontend/tests/browser/smoke.spec.ts`, and
  `scripts/validate-styles.mjs`

### 3.4 Camera module and live presentation

- **Owners:** `frontend/src/modules/camera/index.ts` and
  `frontend/src/modules/camera/live-view.ts`; colocated camera controllers and
  styles own controls, visibility, fullscreen/Picture-in-Picture lifecycle,
  and presentation
- **Contract:** `docs/live-session-lifecycle.md` and
  `docs/platform-compatibility.md`
- **Flow:** the lazy camera module receives normalized configuration and a Home
  Assistant API adapter, acquires pooled media leases, presents the selected
  media element, and emits user control intent. It does not own the underlying
  connection lifetime.
- **Key invariant:** camera presentation can be replaced without creating a
  duplicate connection or overwriting explicit mute preference. Only an actual
  `NotAllowedError` may classify audible playback as autoplay-blocked;
  transient native-media play interruptions do not re-mute the camera.
- **Verification:** `frontend/tests/camera-fallback.test.ts`,
  `frontend/tests/camera-retention.test.ts`,
  `frontend/tests/controls-visibility-controller.test.ts`, and
  `frontend/tests/fullscreen-lifecycle-controller.test.ts`, and
  `frontend/tests/picture-in-picture.test.ts`

### 3.5 Media sessions, retention, and audio intent

- **Owners:** `frontend/src/core/media-session-manager.ts` and
  `frontend/src/core/media-playback.ts`
- **Contract:** `docs/live-session-lifecycle.md`
- **Flow:** the document-scoped manager pools sessions by resolved source and
  grants leases to presentations. It retains bounded healthy sessions across
  presentation and Home Assistant route changes and separately stores the
  user's per-camera mute choice for the document lifetime.
- **Key invariant:** Lit element disconnect is lease release, not automatic
  session destruction; automatic playback state never replaces user intent.
  Every presentation/lifecycle design declares its lease transition, and a
  presentation-only change must not create or renegotiate a connection.
  A surface renders one visible live media layer and removes decoded-media
  fallback layers. Eligible ordinary hosts keep the proven autoplaying WebRTC
  hedge mounted until it decodes; unsupported transport elements are not
  created.
- **Verification:** `frontend/tests/media-session-manager.test.ts` and
  `frontend/tests/camera-retention.test.ts`

### 3.6 Home Assistant direct live connection

- **Owners:** `frontend/src/connections/home-assistant/resolver.ts`,
  `frontend/src/connections/home-assistant/presentation.ts`, the separate
  ordinary and Catalyst presentation policies,
  `frontend/src/connections/home-assistant/index.ts`,
  `frontend/src/connections/home-assistant/hls.ts`, and the isolated
  `frontend/src/connections/home-assistant/catalyst-hls.ts`
- **Contract:** `docs/home-assistant-live-connection.md`
- **Flow:** eligible clients hedge WebRTC and HLS startup and present the first
  decoded candidate; Catalyst uses one retained native-HLS element with
  autoplay, temporary runtime mute, and unmuted default state. After attachment,
  selected-media ownership applies configured audio and requests playback, then
  the element receives the direct Home Assistant stream URL. Concrete adapters
  remain lazy and report timing to the shared startup diagnostics.
- **Key invariant:** Catalyst never starts WebRTC or HLS.js, its adapter is not
  imported by ordinary HLS, and its temporary runtime mute must not set
  `defaultMuted`. Audible autoplay denial always resumes the retained element
  muted; only the lazy Catalyst autoplay policy retries unmuting after playback
  starts. Its native-video host receives Catalyst-only compositor edge
  isolation; Browser and Companion do not. A later WebRTC takeover updates the
  same source indicator directly without creating a second connecting phase.
  Catalyst selected playback follows its isolated two-action sequence (before
  source attachment and at loaded data); generic presentation selection does
  not issue a duplicate playback request.
- **Verification:** `frontend/tests/home-assistant-connection.test.ts`,
  `frontend/tests/home-assistant-hls-connection.test.ts`,
  `frontend/tests/home-assistant-live-resolver.test.ts`, and Catalyst/browser
  cases in `frontend/tests/browser/smoke.spec.ts`

### 3.7 Frontend loading, version identity, and release packaging

- **Owners:** `frontend/src/main.ts`, `frontend/vite.config.ts`,
  `scripts/check-version.mjs`, `scripts/validate-build.mjs`, and
  `scripts/package-release.sh`
- **Contract:** `architecture.md`, sections 5 and 6; `AGENTS.md`, structure and
  version rules
- **Flow:** the eager entry registers the card and diagnostics banner; feature
  chunks load lazily; Vite emits production assets beneath root `dist/`; release
  packaging assembles the integration and HACS archive from generated output.
- **Key invariant:** Python `VERSION` is canonical and every release-bearing
  file agrees with it. Generated output is never a source dependency.
- **Verification:** `corepack yarn check:version`, production build validation,
  and `scripts/validate-build.mjs`

### 3.8 Python integration bootstrap and frontend registration

- **Owners:** `custom_components/watchzone/__init__.py`,
  `custom_components/watchzone/runtime.py`, and
  `custom_components/watchzone/config_flow.py`
- **Contract:** `architecture.md`, sections 7 and 10
- **Flow:** Home Assistant config flow creates the integration entry; setup
  creates the typed runtime and registers the packaged frontend resource;
  unload reverses owned registrations.
- **Key invariant:** WatchZone ships and versions Python and frontend as one
  integration artifact.
- **Verification:** build/release validation currently covers packaging; focused
  Python lifecycle tests must be added when backend behavior expands.

### 3.9 UI feedback, timed visibility, and overlay lanes

- **Owners:** `frontend/src/ui/toast.ts`,
  `frontend/src/ui/timed-visibility.controller.ts`, and each feature's
  colocated overlay styles
- **Contract:** `docs/ui-feedback-and-overlays.md` and
  `docs/platform-compatibility.md`
- **Flow:** features emit categorized messages through a reusable toast class;
  the shared controller owns transient timing and cleanup; feature CSS places
  feedback and controls into responsive logical lanes.
- **Key invariant:** features do not create independent toast/fade timers, and
  touch interaction never retains emulated hover or pointer-focus styling.
- **Verification:** `frontend/tests/toast.test.ts`,
  `frontend/tests/timed-visibility-controller.test.ts`,
  `frontend/tests/controls-visibility-controller.test.ts`, and compact-overlay
  coverage in `frontend/tests/browser/smoke.spec.ts`

### 3.10 Product identity and rename safety

- **Owners:** `frontend/src/core/constants.ts`,
  `custom_components/watchzone/const.py`, and external package metadata
- **Contract:** `architecture.md`, section 2.1; `AGENTS.md`, architecture
  stability rules
- **Flow:** internal code uses responsibility-based names. Current product and
  domain values enter the application only through explicit external identity
  boundaries such as the HA domain, card tag, resource filename, display name,
  package metadata, CSS token namespace, and compatibility diagnostics global.
- **Key invariant:** changing the product display name does not require renaming
  internal classes, types, functions, variables, or compile-time symbols.
  Persisted external IDs require a deliberate migration decision rather than a
  blind constant replacement.
- **Verification:** `corepack yarn check:naming` and
  `scripts/validate-internal-naming.mjs`

## 4. Verification strength and open enforcement gaps

Passing a synthetic test is not equivalent to physical-client validation.
Every handoff must state the strongest evidence actually obtained.

| Contract area               | Automated evidence                                                                           | Evidence still required                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Internal rename safety      | Naming validator runs in every production build and CI                                       | External domain/tag migration plan when the public rename is chosen                    |
| Browser/Catalyst isolation  | Source-boundary validator, resolver/presentation unit tests, and browser routing tests       | Physical Catalyst validation for native media, lifecycle, and audio behavior           |
| HA HLS/WebRTC hedge         | Adapter, HLS-first takeover, retention, and Chromium/Firefox/WebKit tests                    | Live Home Assistant validation against real camera signaling and codecs                |
| Mute intent and autoplay    | Unit/browser tests cover defaults, user overrides, retention, takeover, and blocked playback | Physical Safari, Companion, and Catalyst autoplay-policy validation                    |
| Editor dirty state          | Unit/browser tests cover true/false round trips, preview identity, and Save                  | Live Home Assistant editor validation after HA frontend upgrades                       |
| Responsive/theme behavior   | Style validator, token checks, and three-engine viewport tests                               | Physical phone/tablet safe-area, text-zoom, and native-app validation                  |
| Retention/cleanup           | Lease, navigation, replacement, timer, and controller cleanup tests                          | Long-running live-system observation; no automated heap/leak endurance gate exists yet |
| Home Assistant API currency | Focused adapter boundaries and CI against installed development dependencies                 | Manual review against current HA developer documentation when an HA-facing API changes |

Local Python validation requires the Home Assistant development dependencies.
The repository CI installs them and runs Ruff, mypy, and pytest; a local
environment without those dependencies may report only that validation is
unavailable, never a pass.

## 5. Updating this map

When a change crosses multiple rows, update every affected focused contract but
keep one owner per responsibility. If two rows begin claiming the same state or
decision, resolve the ownership conflict instead of documenting duplicate
systems.
