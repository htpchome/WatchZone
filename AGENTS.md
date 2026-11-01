# WatchZone Agent Instructions

These instructions apply to the entire repository.

## Required reading

Before changing source code, read:

1. `architecture.md`
2. Any contract in `docs/` that governs the affected feature

For card configuration, editor previews, Home Assistant controls, theming, or
responsive card layout, also read `docs/config-editor-lifecycle.md` in full.

For live video, connection management, editor transitions, navigation
retention, or audio state, also read `docs/live-session-lifecycle.md` in full.

For the Home Assistant direct live connection, also read
`docs/home-assistant-live-connection.md` in full.

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
- Python owns provider communication, normalized camera data, layouts,
  persistence, permissions, and shared backend work.
- TypeScript owns rendering, browser media APIs, lazy UI modules, and
  latency-sensitive interaction.
- A provider and a live connection type are different concepts.
- Feature modules do not import one another.
- Concrete live connection adapters are dynamically imported and are not
  statically imported by the live module or eager entry.
- Live sessions are owned by the document-scoped media-session manager, not by
  Lit elements. Element disconnection releases a lease; it does not
  automatically close a retained connection.
- Automatic audio policy never overwrites explicit user mute preference.
- Card-editor typing updates Home Assistant `dirtyState` and a coalesced soft
  preview; it never emits `config-changed` on every keystroke.
- Use current Home Assistant controls and semantic theme tokens. WatchZone
  customization properties use the `--wzc-` prefix.

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
- Each commit pushed to `main` is published for HACS testing and therefore must
  have a unique Semantic Version. During prerelease development, increment the
  prerelease identifier (for example, `0.0.3-beta.1` to `0.0.3-beta.2`).
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

For Python changes, run Ruff, type checking, and focused pytest coverage once
their project configuration exists. On the Windows-mounted development
workspace, ignore Ruff `EXE002` if the filesystem reports every file as
executable.

Always run `git diff --check` before handoff. Preserve unrelated user changes.
