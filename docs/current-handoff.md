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
- Current working version: `0.0.4-dev.235`
- Current commit: `d597070` —
  `v0.0.4-dev.234 - fix(recordings): preserve existing video controls`
- The worktree contains the completed, uncommitted segment-manager and
  media-viewer boundary change described below.

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

Working version `0.0.4-dev.235`:

- The recorded-media viewer moved out of `frontend/src/ui/` into the bounded
  lazy application feature `frontend/src/features/media-viewer/`. It remains
  separate from the Recordings Stage module and from reusable UI primitives.
- Recorded-media requests carry an explicit `review`, `event`, or `recording`
  presentation identity. Presentation selection is independent of the shared
  playback engine so the three shells can diverge without duplicating playback.
- The reusable activity list no longer opens media or owns review/event
  workflows. It emits typed intents; the owning Reviews and Events modules
  resolve playback, retries, review state, analysis, and viewer requests.
- Architecture validation now rejects UI imports of API, feature, provider, or
  Stage ownership and rejects application media-opening commands in UI files.
- Recording scrubber time readouts and segment handle accessible values include
  seconds. Activating the recording-only segment control adds square selectable
  five-minute pre/post regions, second-precision start/end handles,
  selection/exclusion presentation, and Reset, Cancel, Preview, and Download
  actions. The existing recorded-video transport remains intact.
- Preview and Download send the entity and selected timestamps to a
  permission-checked WatchZone WebSocket command. Python resolves the owning
  recordings provider, and Frigate alone constructs the selected playback and
  authenticated download paths. Export remains future work.
- Dialog fitting responds to the expanded segment panel while preserving the
  browser dialog's viewport-relative default placement until the user manually
  drags or resizes it.

Validation is green:

- 326 frontend unit tests
- 78 backend tests
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
