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
- Current working version: `0.0.4-dev.282`
- Current commit: `1c9b5e9` —
  `v0.0.4-dev.281 - fix(cameras): complete secondary settings and release editor media`
- The worktree contains the uncommitted retained-media lifecycle correction
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

Working version `0.0.4-dev.282`:

- Firefox heap snapshots show transient growth rather than a persistent
  JavaScript/DOM leak: shallow heap moves from 91.9 MB to 113.5 MB and returns
  to 87.8 MB after cleanup.
- Connections that finish after their final lease is released now invoke their
  transport parking lifecycle instead of only being labelled parked.
- Retained Home Assistant and Frigate WebRTC video elements now pause and
  detach their stream while parked, then reattach the same stream on resume;
  peer identity, signaling, and Home Assistant trickle ICE remain intact.

- A configured additional camera forms one Camera-owned presentation group and
  replaces the two standalone navigation entries with the group title.
- Desktop/tablet groups support side-by-side or stacked combined presentation
  and cycle `combined → A → B → combined`; focused states retain the group name
  and add only a layout-relative directional icon.
- Phone-width groups show one feed and toggle A/B without a combined stop while
  retaining mixed review, event, and recording scope.
- Each member keeps independent live transport, zoom, pan, activity, and
  recorded-media identity. Audio focus is explicit; TWT/PTZ and linked lights
  remain bound to the main camera, while combined snapshot and combined
  suspension include both members.
- Alerts/detections highlight the physical member. Takeover selects the
  combined desktop group or the alerting phone member.
- Group activity is merged without losing source identity, and overlapping
  recording rows remain separate with A/B markers.
- The editor uses the full Home Assistant camera picker, rejects any entity
  already configured as either a main or secondary camera, and creates the
  valid secondary record atomically. Each physical camera keeps its own Camera
  Name, the group has a separate auto-named Group Name, and grouped secondaries
  have compact non-sortable edit tiles. Both members count toward the
  twelve-camera limit.
- The Additional Camera editor configures the secondary Camera Name and live
  Connection Source directly beneath the camera picker in the same atomic
  group draft. Its compact summary tile presents camera and group identity on
  one line.
- Frigate go2rtc cameras using the HLS fallback expose and honor the
  Low-Latency HLS setting for both primary and additional cameras.
- Editor-preview live sessions are disposable: draft-only sessions are closed
  on replacement or editor teardown, while a session shared with the dashboard
  remains protected by its active lease. This prevents editor use from leaving
  parked media decoders behind.
- Grouped first paint preserves the standard camera-stage ratio. Per-feed
  controls respond on first activation without colliding with carousel
  navigation, directional state uses arrows, and only physically active feeds
  receive alert/detection outlines.
- Pointer presence anywhere in a grouped stage holds both child overlay timers,
  so per-feed controls remain available while the user is interacting with
  them. Group-stage drag updates apply geometry directly and defer the wider
  camera render until the drag settles; stacked group propagation is also
  frame-coalesced to avoid redundant two-feed layout work.
- Mixed grouped Reviews and Events begin with the configured physical camera
  name, while single-camera activity keeps the existing badge set.
- Activity return-navigation caches are pruned when the configured selection
  changes and all source, label, timer, and subscription state is released on
  disconnect. Group overlay holds are also released on pointer exit and
  disconnect.
- The PTZ overlay retains its established transform center and viewport anchor;
  camera-group layout does not reposition it.

Validation is green:

- 384 frontend unit tests
- 105 browser tests across Chromium, Firefox, and WebKit
- Formatting, lint, type checking, architecture/style validation, production
  build, version consistency, release packaging, and final diff checks. The
  validated HACS archive is `dist/watchzone.zip`.

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
