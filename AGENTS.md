# WatchZone Agent Instructions

These instructions apply to the entire repository.

## Required reading

Before changing source code, read:

1. `architecture.md`
2. `ROADMAP.md` for known future capabilities and planning pressure
3. Any contract in `docs/` that governs the affected feature

For card configuration, editor previews, Home Assistant controls, theming, or
responsive card layout, also read `docs/config-editor-lifecycle.md` in full.

For live video, connection management, editor transitions, navigation
retention, or audio state, also read `docs/live-session-lifecycle.md` in full.

For the Home Assistant direct live connection, also read
`docs/home-assistant-live-connection.md` in full.

For two-way talk signaling, controls, audio visualization, or microphone
lifecycle, also read `docs/two-way-talk.md` in full.

For PTZ capability discovery, controls, or motion lifecycle, also read
`docs/ptz.md` in full.

For diagnostics, timing instrumentation, or future logging work, also read
`docs/diagnostics.md` in full.

For any frontend, media, interaction, layout, or styling change, also read
`docs/platform-compatibility.md` in full.

For camera display zoom, pan, or gesture changes, also read
`docs/camera-display-zoom.md` in full.

For camera stage, card sizing, aspect-ratio, or media fitting changes, also read
`docs/camera-presentation-layout.md` in full.

For camera carousel, slide navigation, or Swiper lifecycle changes, also read
`docs/camera-carousel.md` in full.

For accordion behavior or editor disclosure groups, also read
`docs/accordion.md` in full.

For user-visible text or locale handling, also read `docs/localization.md` in
full.

For toast timing, presentation, or placement, also read
`docs/toast-system.md` in full.

For badge presentation or object-label color policy, also read
`docs/badge-system.md` in full.

For reusable draggable tiles or ordered editor lists, also read
`docs/sortable-list.md` in full.

For Stage Design schemas, placeable classification, slots, responsive variants,
or future designer work, also read `docs/stage-layout-system.md` in full.

## Architecture stability

- Treat `architecture.md` as a contract, not a progress log.
- Do not edit architectural contracts merely to describe an implementation.
- Edit an architectural contract only when the user explicitly requests or
  approves an architectural decision that changes it.
- Keep implementation details in code, tests, or focused feature documentation.
- If a request conflicts with an architectural invariant, identify the
  conflict before implementing a parallel or temporary architecture.
- Do not create empty directories, placeholder files, speculative interfaces,
  generic utility dumping grounds, or compatibility layers without a concrete
  requirement.
- Keep code tight and cohesive. Extract shared helpers before real boundary or
  repeated behavior is copied, and use controllers/handlers only where they
  own orchestration, events, or lifecycle.
- Choose classes for identity, state, cleanup, or polymorphism; choose plain
  functions for stateless transformations. Concrete near-term architecture may
  guide the choice, but hypothetical extensibility does not justify ceremony.
- Translate errors once at the useful boundary. Do not swallow, repeatedly log
  and rethrow, or duplicate defensive wrappers across layers.
- Keep the browser console quiet: one name/version startup banner plus
  actionable warnings or errors. Remove temporary tracing before handoff and
  route future diagnostics through the centralized logger when introduced.

## Core boundaries

- WatchZone is one mandatory Python integration with a packaged frontend.
- Python owns provider communication, normalized camera data, user-created
  Stage Designs, persistence, permissions, and shared backend work. The
  frontend may ship immutable built-in Stage Design templates; both sources
  must validate into the same versioned layout contract and use one renderer.
- TypeScript owns rendering, browser media APIs, lazy UI modules, and
  latency-sensitive interaction.
- A provider and a live connection type are different concepts.
- Modules and components do not import one another or another placeable.
- Built-in and external provider capabilities register eagerly through the
  versioned backend extension registry during integration setup. Network
  clients, sessions, and provider work remain demand-driven. Features use the
  registry and never construct provider import paths, import a concrete provider
  implementation, or branch on provider names.
- External backend integrations may import only the public extension contract,
  must unregister on unload, and must not receive unrestricted runtime state.
  Add a typed registry for each future extension area; never add a generic
  plugin bag, service locator, or arbitrary import hook.
- Camera owns camera selection and its private live presentation. Major stage
  content systems are modules; portable capability presentations placed into a
  compatible module slot are components. Both consume narrow core context and a
  public provider resolver; neither imports or mutates another placeable.
  Provider-specific transport stays beneath the provider.
- Internal classes, custom-element names, diagnostics keys, and events derive
  from centralized identity constants. Product display text derives from
  `APP_NAME`; do not scatter branded identifiers through implementation code.
- Live sessions are owned by the document-scoped media-session manager, not by
  Lit elements. Element disconnection releases a lease; it does not
  automatically close a retained connection.
- Automatic audio policy never overwrites explicit user mute preference.
- Card-editor typing updates Home Assistant `dirtyState` and a coalesced soft
  preview; it never emits `config-changed` on every keystroke.
- The editor requests the dirty-state context once without subscription because
  it only writes state. Dirty state does not transport card configuration. The
  isolated editor lifecycle adapter commits the complete draft immediately
  before Home Assistant handles Save, with feature detection and a public
  `config-changed` fallback. Do not access dialog internals elsewhere.
- Use current Home Assistant controls and semantic theme tokens. WatchZone
  customization properties use the `--wzc-` prefix.
- Use feature-based vertical slices with state/configuration flowing down and
  typed intents flowing up. Do not impose MVP or MVVM layers on simple Lit
  components. Add a controller only for distinct orchestration,
  subscriptions, or lifecycle; add model/type files only for separately owned
  policy or contracts.
- Every Lit element keeps CSS in a colocated `*.styles.ts` file. Component
  behavior files must not contain `css` template literals.
- `frontend/src/styles/theme-tokens.ts` is the only frontend source allowed to
  reference Home Assistant theme variables directly. Feature and component
  styles consume semantic `--wzc-*` tokens only. Define a WatchZone token
  before introducing a new visual semantic state.

## Structure and generated output

- Keep code inside the stable ownership roots defined in `architecture.md`.
- Begin a feature with the fewest files consistent with its stable boundary.
- All generated production and release output goes beneath repository-root
  `dist/`; source packages must not contain build output.
- Vite writes frontend assets to `dist/frontend/`.
- Release staging writes the assembled integration to `dist/package/` and the
  HACS release archive to `dist/watchzone.zip`.
- `dist/` is generated output. Never edit it manually or use it as the source
  of a code change.
- A HACS release ZIP contains the contents of the WatchZone integration at the
  ZIP root. It must not wrap them in `dist/`, `custom_components/`, or
  `watchzone/` directories.
- Source code must not import generated files.

## Version and commit rule

- `custom_components/watchzone/const.py` `VERSION` is canonical.
- Each release-affecting commit pushed to `main` is published for HACS testing
  and therefore must have a unique Semantic Version. During prerelease
  development, increment the prerelease identifier (for example,
  `0.0.3-dev.1` to `0.0.3-dev.2`).
- A commit limited to documentation, tests, or workflow maintenance validates
  without publishing a HACS release and keeps the current application version.
- Local work that is not being handed off for a commit does not itself require
  a version change.
- Keep `frontend/package.json`, `manifest.json` once present, and all other
  version-bearing release metadata synchronized with `VERSION`.
- Run `corepack yarn check:version` from `frontend/` before a commit.
- Prefix commit subjects with the exact current version:
  `vX.Y.Z - type(scope): summary`.
- Whenever a turn includes a commit or hands work off to be committed, provide
  a proposed commit subject containing the exact version.

## Validation

For frontend changes, run from `frontend/` as applicable:

- `corepack yarn format`
- `corepack yarn lint`
- `corepack yarn typecheck`
- `corepack yarn test`
- `corepack yarn build`
- `corepack yarn test:browser --project=chromium` for browser-visible behavior
- Run the complete `corepack yarn test:browser` matrix before handing off a
  browser-visible feature. Chromium, Firefox, and WebKit are mandatory; one
  engine passing is not evidence that the feature is portable.

For Python changes, run Ruff, type checking, and focused pytest coverage once
their project configuration exists. On the Windows-mounted development
workspace, ignore Ruff `EXE002` if the filesystem reports every file as
executable.

Always run `git diff --check` before handoff. Preserve unrelated user changes.
