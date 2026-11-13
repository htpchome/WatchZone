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
- Working version: `0.0.4-dev.286`
- Current commit: `588c525` —
  `v0.0.4-dev.285 - fix(camera): isolate inactive fade slides`
- The worktree contains the uncommitted activity-end reconciliation described
  below. Always verify `git status`, the canonical version in
  `custom_components/watchzone/const.py`, and the latest commit.

## Active change: activity-end reconciliation

- Camera outlines and camera-navigation activity indicators derive from one
  shared classification map owned by `LiveActivityHighlightController`.
- A numeric provider `end_time` is authoritative even if Frigate labels the
  message as an `update`. This prevents a stale phase from retaining activity.
- While normalized active reviews exist, a bounded five-second reconciliation
  checks a small authoritative review window. It stops when idle, preserves
  state on request failure, and discards stale work after reconfiguration or
  disconnect.
- Activity is keyed by camera and review ID. Duplicate updates replace one
  record, ending one review preserves other active reviews, alerts outrank
  detections visually, and recently ended IDs prevent late updates from
  resurrecting activity.
- Rapid eligible reviews are handled in arrival order: the current takeover
  finishes, the next begins, then the prior user camera is restored.
- The reported stuck outline/navigation icon was intermittent and could not be
  reproduced consistently. Slide timing was suspected but not established as
  the cause. No Slide-specific workaround or carousel behavior change was
  added; monitor real Frigate traffic after release.

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
  Camera-owned component; both remain synchronized through Camera selection.
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

Validated for `0.0.4-dev.286`:

- 392 frontend unit tests
- 111 Playwright tests across Chromium, Firefox, and WebKit
- Formatting, lint, type checking, architecture/style checks, production build,
  version consistency, release packaging, and `git diff --check`
- HACS archive: `dist/watchzone.zip`

Slide takeover coverage verifies activity-indicator clearing, camera return,
overlay reveal, zoom, and resize-handle interaction. Fade interaction remains
covered separately.

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
