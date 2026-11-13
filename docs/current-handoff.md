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
- Current working version: `0.0.4-dev.278`
- Current commit: `ee769c7` —
  `v0.0.4-dev.277 - refactor(stage): promote camera navigation and add switcher overlay`
- The worktree contains the completed, uncommitted additional-camera grouping
  feature described below.

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

Working version `0.0.4-dev.278`:

- A configured additional camera forms one Camera-owned presentation group and
  replaces the two standalone navigation entries with the group title.
- Desktop/tablet groups support side-by-side or stacked combined presentation
  and cycle `combined → A → B → combined`; focused states retain the group name
  and add only a layout-relative directional icon.
- Phone-width groups show one feed and toggle A/B without a combined stop while
  retaining mixed review, event, and recording scope.
- Each member keeps independent live transport, zoom, and pan state. Audio focus
  is explicit; TWT/PTZ remain bound to the main camera, while linked lights,
  combined snapshot, and combined suspension include both members.
- Alerts/detections highlight the physical member. Takeover selects the
  combined desktop group or the alerting phone member.
- Group activity is merged without losing source identity, and overlapping
  recording rows remain separate with A/B markers.
- The editor owns group selection, sanitized unique title, layout, validation,
  reference maintenance, and removal within the camera draft lifecycle.

Validation is green:

- 380 frontend unit tests
- 105 browser tests across Chromium, Firefox, and WebKit
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
