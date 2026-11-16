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
- Working version: `0.0.4-dev.362`
- Current commit: `aea3491` —
  `v0.0.4-dev.360 - docs(handoff): record audit priorities and current baseline`
- The worktree was clean when this snapshot was replaced. Always verify
  `git status`, the canonical version in
  `custom_components/watchzone/const.py`, and the latest commit.

## Current camera and media baseline

- Camera live sessions remain document-owned and lease-based. Editor
  transitions, Home Assistant route navigation, dialogs, and ordinary
  reparenting must preserve a healthy retained connection rather than create a
  replacement player.
- Picture-in-Picture is working across the retained WebRTC, HLS, and MSE paths.
  MSE PiP survives leaving and returning to the dashboard by resolving the
  current attached presentation video rather than retaining a stale element.
  Do not add transport-specific PiP workarounds without tracing session and
  presentation ownership first.
- Camera owns authoritative selection. Carousel, navigation, activity modules,
  alert takeover, and recorded-media flows consume that selection rather than
  maintaining parallel camera state.
- Grouped A/B presentations retain independent media identity, zoom, pan, and
  activity while sharing the owning Camera stage and overlay coordination.
- Recorded-media dialogs use an isolated zoom/pan viewport, coalesced modal
  resizing, touch double-tap zoom, and a corner resize grip. Their metadata
  surface excludes dialog actions and the resize grip.
- Review and Event tiles use a fixed-height compact presentation with one
  non-wrapping badge lane, a neutral `+N more` overflow badge, and the shared
  responsive width contract.

## Stage types and minimal camera baseline

- The editor currently offers Minimal Camera Stage, Camera Only Stage, and Full
  Stage. Immutable built-in JSON Stage templates are frontend defaults. The
  future Python-owned Stage Designer and user-created Stage Design persistence
  are intentionally not being connected yet.
- Camera Only Stage uses its single standard built-in layout for normal and
  mobile presentation; it does not expose redundant layout selectors.
- Minimal Camera Stage renders only the first configured main camera. An A/B
  secondary is not presented. It uses the reusable lightweight camera
  presentation rather than instantiating the full Camera module, carousel,
  zoom/pan, PTZ, TWT, lights, or full side controls.
- Minimal Camera controls are configurable behind one menu button and include
  fullscreen, PiP, mute/volume, and optional source label. The expanded control
  lane remains visible until the menu is explicitly closed.
- Minimal interactions support tap, hold, and double-tap actions through the
  Home Assistant-style editor. `Open Live View` transfers the retained player
  into the draggable/resizable WatchZone live dialog and restores it on close.
- Minimal presentations enforce backend-reported suspension regardless of live
  connection type. Suspension must prevent presentation without preventing the
  user from configuring a Frigate go2rtc source.
- Alert/detection highlighting applies to both the inline minimal camera and
  its live dialog.

## Responsive, theme, and editor invariants

- Responsive width decisions use the enforced `480px`, `600px`, `768px`, and
  `1024px` scale. Runtime device classification and CSS container/viewport
  queries consume the same contract.
- Home Assistant theme variables remain isolated to
  `frontend/src/styles/theme-tokens.ts`; feature styles consume semantic
  `--wzc-*` tokens.
- Media and AI information dialogs share the Home Assistant glass treatment.
  Filter, calendar, suspension, and other focused task dialogs use the solid
  task surface.
- Editor typing updates Home Assistant dirty state and a coalesced preview. The
  isolated editor lifecycle adapter commits the complete draft immediately
  before Save. Extracted editor sections must not become independent draft or
  persistence owners.

## Architecture audit and next work

The November 16 audit found the overall feature boundaries, retained-session
lifecycle, lazy transport loading, theme ownership, and listener/observer
cleanup sound. No broad memory leak or uncontrolled dependency problem was
identified. The next agreed work is deliberately incremental:

1. Replace eager full-window activity retrieval with bounded, progressive
   loading and stable deduplication.
2. Extract cohesive editor sections while retaining one top-level draft,
   dirty-state, preview, and serialization owner.
3. Only after extraction is stable, avoid mounting expensive closed accordion
   content while preserving draft values, validation, focus, and Home Assistant
   control behavior.
4. Move raw Frigate activity subscriptions and normalization behind a
   provider-neutral Python subscription, prove message parity, then remove the
   frontend-specific route.
5. Consider a read-only normalized backend camera catalog later, without
   migrating stored camera configuration until a concrete provider or Stage
   Designer requirement needs it.
6. Consolidate media download preparation one media type at a time, preserving
   Safari and Companion user-gesture behavior.

Completed at `0.0.4-dev.362`: provider-neutral direct Event and Review lookup
routes resolve one ID through the owning backend provider. Deep links use the
direct route first and retain the bounded paged lookup as a temporary parity
fallback.

Explicitly deferred:

- Do not connect Python Stage Design persistence merely for the current
  immutable built-in JSON defaults. Revisit it with the Stage Designer and
  user-created Stage Designs.
- Do not change the GitHub release pipeline or make publication depend on the
  complete validation workflow during the current prerelease development
  cycle.

## Performance-budget snapshot

- `architecture.md` retains the long-term eager-entry target of 50 KiB gzip.
- The current build validator temporarily uses a 64 KiB release ceiling with a
  4 KiB safety margin. This is implementation headroom, not a replacement
  architectural target.
- At `0.0.4-dev.360`, validation measures the eager graph at 57,332 bytes gzip
  and the lazy editor entry at 18,564 bytes gzip.
- The built-in Stage catalog is the largest practical eager-splitting target.
  Measure and reduce the graph before requesting another ceiling increase.
- The editor is close to its current 20 KiB gzip release budget and should be
  decomposed before adding substantial editor features.

## Validation status

Validated for `v0.0.4-dev.360`:

- 455 frontend unit tests
- 129 Playwright tests across Chromium, Firefox, and WebKit
- formatting, lint, type checking, architecture/style/license checks,
  production build, version consistency, and `git diff --check`
- Ruff and strict mypy checks for the Python integration

The Python pytest suite was not completed during the architecture audit; do not
infer a pass or failure from that audit run.

## Handoff rules

- Trace the complete affected path before editing. Do not stack local patches
  over symptoms or add browser-specific workarounds without identifying the
  owning lifecycle.
- Preserve unrelated user changes and established behavior. Keep changes
  small, cohesive, and independently testable.
- Treat mobile Safari, Home Assistant Companion, Chromium, Firefox, WebKit,
  editor preview, and dashboard navigation as supported environments.
- Release-affecting work handed off for commit requires a unique synchronized
  version. Documentation/test/workflow-only work keeps the current version.
- Do not commit or sync. Provide the exact version-prefixed proposed commit
  subject after validation.
- Replace this snapshot when the active task or version changes materially. Do
  not append a chronological conversation log.
