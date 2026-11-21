# Current Development Handoff

This is a replaceable working snapshot, not an architectural contract.
`AGENTS.md`, `architecture.md`, `ROADMAP.md`, and the governing contracts in
`docs/` take precedence.

## Start here

Work in `/workspaces/WatchZone`. Before changing code, read the required
contracts, then verify `git status`, `git log -1`, and
`custom_components/camera_optics/const.py`; do not trust this snapshot over the
repository. Preserve unrelated changes. The user owns commits and syncs.

## Baseline

- Branch: `main`.
- HEAD before this work: `45c2138` —
  `v0.0.4-dev.502 - refactor(identity): rename app to CameraOptics`.
- Version being prepared: `0.0.4`.
- Proposed subject:
  `v0.0.4 - release(identity): establish CameraOptics stable cutover`.

## CameraOptics identity

- The product and Home Assistant display name are `CameraOptics`.
- The Home Assistant domain, Python package, WebSocket namespace, and HTTP
  namespace are `camera_optics`.
- The Lovelace type is `custom:camera-optics-card`; the stable frontend entry
  is `camera-optics.js`; the HACS artifact is `camera-optics.zip`.
- The development repository and workspace remain `WatchZone`. Repository URLs
  therefore continue to point at `htpchome/WatchZone` during this phase.
- Internal `wzc` custom properties, element names, persisted node IDs, events,
  and diagnostics identity remain stable.
- Devcontainer setup and sync scripts use `CameraOptics` and `camera_optics`
  from `.devcontainer/project.env` without changing the repository-derived
  workspace or Docker volume names.
- Brand icons retain their existing blue square treatment and dimensions, with
  a centered white `CO` mark.

## Persistent two-way talk

- A document-scoped session now owns the active outgoing peer and microphone
  independently of Lit card instances. Removing a card during Home Assistant
  view or dashboard navigation no longer ends an established call.
- Persistence is a global application feature. It is not a Stage module,
  component, placeable, or configurable Stage item.
- The camera placement and persistent tile now render the same non-placeable
  shared TWT controls element. Button markup, icons, spinner, soundwave, active
  styling, muted styling, and inactive styling have one implementation. The
  persistent tile owns only its surrounding document-level shell.
- Shared controls have only `standard` and `overlay` presentations. The
  persistent tile uses `standard`; only camera overlay placement uses the
  alternate `overlay` presentation.
- The shared element is the sole owner of TWT button geometry, icon sizing,
  panel styling, and state colors. The Stage placement and persistent tile only
  position it. Standard controls therefore retain identical computed layout
  and styling when moved between those surfaces; overlay changes only its
  explicit surface and color tokens.
- The shared controls always reserve the full active three-button width. Ready
  state renders one centered muted-microphone button inside that stable
  footprint, so connection state changes cannot move adjacent layout.
- The camera that owns the active session continues to show the normal Stage
  controls. The global tile is shown only while that camera surface is absent
  or presenting another camera.
- The tile is a fixed, document-body overlay at bottom center with safe-area
  padding. It follows the live Home Assistant dashboard-panel rectangle across
  expanded, collapsed, hidden, and modal sidebar layouts. It spans the viewport
  in one row at the compact breakpoint and is bounded by the dashboard panel on
  larger screens. Compact presentation has visible side and bottom gutters,
  inline title/camera text, and one compact row. Talk controls use the true
  center when clear, otherwise shift only far enough right to clear the identity
  without wrapping, while edge actions stay pinned. The tile enters the browser
  top layer with a maximum-z fixed fallback, and its controls retain explicitly
  contrasting side icons. Its background uses the defined opaque popover
  surface token rather than an undefined token.
- Closing the tile ends the call and dismisses its retained target. Pressing
  the tile microphone ends the call but retains the target and tile so the
  same camera can be restarted. Pressing it again restarts the session.
- A stopped restart launcher is local to the current camera context. Any route,
  dashboard, or camera-selection change after talk ends permanently dismisses
  it; only a connected session follows navigation. Returning to its camera also
  consumes the launcher, so it cannot reappear on a later camera switch.
- The camera action returns to the captured Home Assistant route, selects the
  session camera through the existing deep link, and scrolls the matching
  CameraOptics surface into view. The tile then yields to the normal controls.
- Camera switching or card removal preserves a connected call. An incomplete
  connection attempt is cancelled if its initiating surface leaves. Background
  and frozen-document policy still closes and dismisses the session.
- Incoming audio remains on the separate live-camera WebRTC peer. The document
  talk session takes an additional receive lease and owns a temporary audio
  attachment while the camera presentation is absent, so dashboard navigation
  cannot park or evict the receive peer. The talk peer remains send-only.
- One session-owned speaker mute state drives both presentations. Every talk
  connection starts with incoming audio unmuted regardless of prior camera
  state, and every exit stores and applies camera muted regardless of the final
  in-session speaker state. A retained camera presentation refreshes that
  stored mute preference when it becomes active again, preventing stale
  pre-exit audio state from restoring unmuted playback.
- Successful talk capability results are cached by HA connection and camera.
  First-load discovery shows the disabled control in its final position, and a
  retained active session renders immediately when its camera surface returns
  without waiting for capability discovery.
- The global tile is lazy loaded only when talk is first started. Shared
  soundwave rendering moved to `frontend/src/ui/` so neither presentation
  imports the other.

## Other active baselines

- Desktop and tablet documents retain healthy WebRTC, MSE, HLS.js, and native
  HLS transport identity while hidden, unfocused, or minimized. Their players
  park decoder/loading work and must produce an advancing frame on foreground
  resume; only a stale transport is closed and immediately replaced. Physical
  phones close transports while hidden and reconnect active leases on return.
- WebRTC initial failures and established failures share the provider's bounded
  retry cadence. Camera release/reacquisition preserves an in-flight attempt or
  its cooldown instead of creating another upstream consumer; MSE/HLS remains
  available until one decoded WebRTC frame takes over.
- Full Stage moves the same stable linked-light and TWT component nodes between
  Camera controls below 600px and activity navigation at 600px and wider.
- Only `overlay` presentation consumes overlay tokens. Every non-overlay
  placement uses generic HA-theme-aware capability tokens.
- `ptz-panel` is an independent Stage module containing the portable PTZ
  component. Panel `+/-` use Camera display zoom, not optical PTZ.
- Events is absent from built-in Stage JSON but remains a registered lazy module
  for future Stage Designs.
- HA control-WebSocket interruption does not destroy a healthy retained media
  transport. Visible recovery restarts stalled pending work without bypassing
  a failed WebRTC probe's provider cooldown.
- Shared zoom/pan and shared media-stage resize remain the sole owners of those
  behaviors for live and recorded media.
- Shared UI primitives now live in named ownership folders, including icons,
  controls, activity list, media overlay, motion, popover, toast, TWT, and
  zoom. The UI root contains no loose implementation files, compatibility
  re-exports, or generic barrel module.

## Validation for `0.0.4`

- Formatting, lint, typecheck, architecture/style/license checks, production
  build, and version synchronization pass.
- Frontend unit tests pass 539/539 and cover desktop background retention,
  stale retained-player
  replacement, phone background closure, MSE foreground frame validation,
  WebRTC cooldown preservation across camera reacquisition, stopped-launcher
  disposal, and mute-preference refresh on camera reactivation.
- Python Ruff and mypy validation pass. Pytest passes 118/121; the remaining
  failures predate and are unrelated to the identity rename: two stale test
  expectations against the installed Home Assistant/data behavior and one
  missing `turbojpeg` development dependency.
- Browser tests: 174/174 across Chromium, Firefox, and WebKit. The TWT flow
  additionally asserts one ready button versus three connected buttons and a
  stable shared-control bounding box across connection state changes. The
  focused TWT browser flow additionally compares standard camera and persistent
  instances for identical dimensions, relative button placement, panel radius,
  and side-icon color.
- Browser assertions cover the normal-control/global-tile handoff, connected
  call retention across direct route departure and camera changes, retained
  restart behavior, navigation back to the session camera, top-layer stacking,
  centered visible controls, compact side gutters and bottom anchoring, bounded
  desktop layout, and responsive relocation of the normal controls.
- Physical Home Assistant, Companion, Safari hardware media, Catalyst, and
  real-device microphone behavior remain authoritative where automation cannot
  reproduce host or hardware behavior; report those as unverified until tested.

## Working rules

- Trace ownership and the first divergent frame or event before editing.
- Preserve one owner per state, transport, transform, gesture, and lifecycle.
- Follow the user's literal design; adjacent analysis does not authorize a
  redesign.
- Treat physical screenshots and recordings as evidence. Automated tests are
  necessary but do not overrule visible behavior.
- Never claim success without validation evidence.
- Never commit. Always provide an exact version-prefixed proposed subject.
