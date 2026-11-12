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
- Current working version: `0.0.4-dev.277`
- Current commit: `6c542e5` —
  `v0.0.4-dev.276 - fix(reviews): synchronize takeover drafts and toolbar controls`
- The worktree contains the completed, uncommitted camera-navigation module
  conversion and camera-switcher overlay described below.

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

Working version `0.0.4-dev.277`:

- Camera navigation is now the standalone `camera-navigation` Stage module.
  The built-in Stage no longer wraps it as a component in a generic Panel.
- The optional Camera Switcher Overlay is a separate component in Camera's
  `top-center` overlay slot. The Live Media Player editor toggle defaults off,
  and the component is omitted entirely unless enabled with multiple cameras.
- The switcher and navigation module independently consume the card-scoped
  camera-selection context. Manual selection, carousel transitions, and
  alert/detection takeover therefore remain synchronized without either
  placeable importing the other.
- The switcher uses the active camera session's existing overlay visibility,
  reveal, and hold lifecycle. Its open menu keeps the shared overlay timer held,
  and activity icons remain exclusive to camera navigation.
- Architecture and Stage/carousel contracts now record the approved module and
  component classification.

Validation is green:

- 372 frontend unit tests
- 96 browser tests across Chromium, Firefox, and WebKit
- Formatting, lint, type checking, architecture/style validation, production
  build, and version consistency. Release packaging and final diff checks are
  rerun immediately before handoff.

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
