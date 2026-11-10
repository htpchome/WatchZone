# Current Development Handoff

This is a replaceable snapshot for starting a new development chat. It is not
an architectural contract and must not override `AGENTS.md`, `architecture.md`,
or a governing feature contract in `docs/`.

## Starting a new chat

Give the next agent this instruction:

> Work in `/workspaces/WatchZone`. Read `AGENTS.md` completely, then read
> `docs/current-handoff.md`. Before changing code, read every repository
> contract required by `AGENTS.md` for the requested feature. Inspect the
> current worktree and implementation rather than relying on assumptions from
> the handoff. Do not commit or sync; provide a proposed commit subject after
> validation.

## Repository state

- Branch: `main`
- Current working version: `0.0.4-dev.233`
- Current commit: `4541454` —
  `v0.0.4-dev.232 - fix(media): center recorded media dialog on card`
- The worktree contains the completed, uncommitted recording scrubber change
  described below.

Always check `git status`, the canonical version in
`custom_components/watchzone/const.py`, and the latest commit before starting.
The repository state takes precedence over this snapshot.

## Current product direction

- WatchZone is an early-stage Home Assistant camera card with a mandatory
  Python integration and packaged Lit/TypeScript frontend.
- Stage code follows the ownership boundaries in `architecture.md`. Do not use
  `src/stage` as a general feature dumping ground.
- Provider-specific transport and normalization stay below provider-neutral
  frontend and backend contracts. Future providers may include systems other
  than Frigate.
- Reviews are the primary activity presentation. The Events module remains for
  comparison and testing for now and must not be removed without an explicit
  request.
- Recordings are a separate stackable module organized by localized day and
  hourly rows.
- Shared media behavior, touch behavior, overlay timing, zoom, pan, and modal
  playback must remain reusable and consistent rather than being reimplemented
  per player or control.

## Current completed change

Working version `0.0.4-dev.233`:

- Recording-hour playback has a dedicated scrubber below the video with a
  play/pause control, a full clock-hour scale, ten-minute labels, a current-time
  pointer, fixed product colors, rounded presentation, and striped gaps.
- Provider-neutral recording hours expose clock bounds, playable spans with
  concatenated-media offsets, and alert/detection markers. Frigate normalizes
  segments and review thumbnails into that contract; review lookup failure
  does not make recordings unavailable.
- Hovering or focusing a marker presents its thumbnail and classification;
  activating it seeks to the marker start and plays. Reviews and Events retain
  their existing overlay transport and do not render the recording scrubber.
- Dialog sizing accounts for the added recording controls after they render,
  while preserving the existing shared modal fit, drag, resize, and centered
  placement behavior.

Validation is green:

- 324 frontend unit tests
- 77 backend tests
- 81 browser tests across Chromium, Firefox, and WebKit
- Formatting, lint, type checking, architecture/style validation, production
  build, version consistency, release packaging, and `git diff --check`

## Previously completed behavior

Release `0.0.4-dev.231` added and validated:

- Frigate GenAI score and concerns in the Reviews-only AI Analysis dialog.
- AI Analysis dialog placement centered on the WatchZone card with viewport
  clamping.
- An authoritative cache-bypassed Reviews query when a camera becomes active,
  so a draft that began while another camera was selected appears immediately.
- Protection against late or out-of-order review updates restoring a camera
  highlight after the review ended.
- Stale highlight clearing when a realtime activity subscription fails.

Validation for that release was green:

- 320 frontend unit tests
- 76 backend tests
- 81 browser tests across Chromium, Firefox, and WebKit
- Formatting, lint, type checking, architecture/style validation, production
  build, version consistency, release packaging, and `git diff --check`

## Working requirements

- Trace the complete affected path before editing. Do not patch symptoms or
  make browser-specific fixes.
- Preserve intentional behavior and unrelated user changes. Do not remove a
  feature to make a test or layout pass.
- Keep changes in small, reviewable slices unless the user explicitly approves
  a broader coordinated change.
- Maintain separation and reusability without speculative abstraction,
  compatibility layers, or generic utility dumping grounds.
- Treat mobile Safari/Home Assistant Companion, Chromium, Firefox, WebKit, and
  Home Assistant editor-preview behavior as real supported environments.
- Do not change Home Assistant editor layout or global card geometry to conceal
  a local component defect.
- Browser-visible work is not ready for handoff until the complete required
  browser matrix passes.
- Release-affecting work handed off for commit needs a unique synchronized
  version. Workflow-, test-, or documentation-only commits do not.
- Do not commit or sync. The user reviews, commits, and pushes changes.
- Every implementation handoff must include the exact proposed version-prefixed
  commit subject and must not claim GitHub release success based only on local
  validation.

## Handoff maintenance

Replace this file with a fresh concise snapshot when the active task or version
changes materially. Do not append a running conversation log. Durable rules
belong in the appropriate repository contract only when the user explicitly
approves that contract change.
