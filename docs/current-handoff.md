# Current Development Handoff

This is a replaceable snapshot, not an architectural contract. `AGENTS.md`,
`architecture.md`, and the governing contracts in `docs/` take precedence.

## Starting a new chat

> Work in `/workspaces/WatchZone`. Read `AGENTS.md` completely, then read
> `docs/current-handoff.md`. Before changing code, read every repository
> contract required by `AGENTS.md` for the requested feature. Inspect the
> current worktree and implementation rather than relying on assumptions from
> the handoff. Do not commit or sync; provide a proposed commit subject after
> validation.

## Repository state

- Branch: `main`
- Working version: `0.0.4-dev.308`
- Current commit: `4b1cd07` —
  `v0.0.4-dev.307 - fix(editor): relocate review history control`
- The worktree contains the uncommitted Reviews slider-marker change described
  below. Always verify `git status`, the canonical version in
  `custom_components/watchzone/const.py`, and the latest commit.

## Active change: Reviews history setting

- The shared Reviews and Events history window now appears in the Reviews
  editor section as Days of Reviews to Display. It uses Home Assistant's native
  bounded slider, one marker per selectable day, and an exact-value input
  without adding a frontend dependency; the persisted `event_history_days` key
  still controls both modules.

## Live camera and group invariants

- The Camera module owns authoritative selection. Carousel, camera navigation,
  alert takeover, Reviews, Events, and Recordings consume that selection rather
  than maintaining parallel active-camera state.
- Exactly one carousel slide is interactive. Inactive slides are `inert` and
  hidden from the accessibility tree for every transition mode, preventing
  invisible Fade slides from intercepting input.
- A grouped A/B stage owns one shared overlay controller. Member feeds retain
  independent source, zoom, pan, activity, and recorded-media identity.
  Activation cancels stale pointer capture, gestures, overlay holds, and resize
  ownership. Do not introduce a second stage or transition-specific lifecycle.
- Desktop/tablet groups support side-by-side or stacked combined presentation
  and cycle `combined → A → B → combined`. Phone groups show one member and
  toggle A/B while retaining mixed group activity scope.
- TWT/PTZ belong only to the main member; linked lights are shared for
  presentation. Combined snapshot and suspension include both members.
- Alert/detection outlines apply only to the physical member with activity.
  Takeover selects the combined desktop group or the alerting phone member.
- Home Assistant and Frigate WebRTC sessions are document-owned. Parking
  detaches retained media while preserving peer identity, signaling, and Home
  Assistant trickle ICE. Editor-only draft sessions must close on replacement
  or editor teardown.
- The PTZ overlay transform center and viewport anchor are established behavior
  and must not move during camera/group work.

## Configuration and architecture notes

- WatchZone is one mandatory Python integration with a packaged Lit/TypeScript
  frontend. Provider transport/normalization stays below provider-neutral
  contracts; features must not branch on provider names.
- Stage code follows `architecture.md`; do not use `src/stage` as a dumping
  ground. Modules/components do not import or mutate other placeables.
- Camera navigation is a module. The optional camera-switcher overlay is a
  Camera-owned component. The slideshow overlay is another Camera-owned
  component; all remain synchronized through Camera selection.
- Additional-camera selection uses the full Home Assistant camera picker but
  rejects an entity already configured as a main or secondary. Both members
  count toward the twelve-camera limit and retain independent names and source
  settings; the group has its own auto-named Group Name.
- Reviews are the primary activity presentation. Events remain for comparison
  and testing unless explicitly removed. Recordings remain a separate stackable
  module organized by localized day and hourly rows.
- Keep media behavior, overlay timing, zoom/pan, controls, dialogs, buttons,
  theme semantics, and editor controls reusable. Do not duplicate presentation
  logic to fix a local defect.

## Validation status

Validated for `v0.0.4-dev.308`:

- frontend unit tests (422 tests)
- Playwright tests across Chromium, Firefox, and WebKit (39 per engine)
- formatting, lint, type checking, architecture/style checks, production build,
  version consistency, and `git diff --check`

Focused coverage verifies the renamed control is owned by Reviews, uses the
bounded Home Assistant slider with step markers, preserves the shared
configuration key, and continues to publish one normalized semantic update.

## Handoff rules

- Trace the complete affected path before editing; do not patch symptoms or add
  browser/transition-specific workarounds.
- Preserve unrelated user changes and intentional behavior. Keep changes small,
  cohesive, and reviewable without speculative abstractions or compatibility
  layers.
- Treat mobile Safari/Home Assistant Companion, Chromium, Firefox, WebKit, and
  editor preview as supported environments. Complete the required browser
  matrix before handing off browser-visible work.
- Release-affecting work handed off for commit requires a unique synchronized
  version. Documentation/test/workflow-only changes keep the current version.
- Do not commit or sync. Provide the exact version-prefixed proposed commit
  subject after validation; local packaging is not evidence of GitHub release
  success.
- Replace this snapshot when the active task or version changes materially. Do
  not append a chronological conversation log.
