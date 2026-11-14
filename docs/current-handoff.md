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
- Working version: `0.0.4-dev.302`
- Current commit: `139bc6c` —
  `v0.0.4-dev.302 - fix(camera): isolate grouped side-by-side resizing`
- The worktree contains the uncommitted camera-navigation overflow change
  described below. Always verify `git status`, the canonical version in
  `custom_components/watchzone/const.py`, and the latest commit.

## Active change: camera-navigation overflow

- Camera navigation reserves equal inline-start and inline-end control areas.
  A themed chevron and hidden-camera count appear only while camera options are
  outside the local viewport in that direction.
- The shared navigation appearance owns the bounded horizontal scroll surface.
  Touch supports native horizontal panning plus non-mandatory proximity snap
  points; vertical page panning remains allowed.
- Edge controls scroll the local strip smoothly. Carousel, switcher,
  slideshow, and takeover selection reveal the authoritative selected option
  without scrolling the card, dashboard, or document.
- One Camera Navigation-owned overflow controller owns geometry measurement,
  resize observation, scrolling, and cleanup. It does not own camera selection
  or introduce another carousel/navigation path.

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

Validated for `v0.0.4-dev.302`:

- frontend unit tests
- Playwright tests across Chromium, Firefox, and WebKit (38 per engine)
- Formatting, lint, type checking, architecture/style checks, production build,
  version consistency, and `git diff --check`

Browser coverage verifies directional control visibility and counts, smooth
local scrolling, selected-option reveal, touch panning, proximity snap,
responsive observation, theme tokens, and unchanged document scroll across
Chromium, Firefox, and WebKit.

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
