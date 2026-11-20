# Current Development Handoff

This is a replaceable working snapshot, not an architectural contract.
`AGENTS.md`, `architecture.md`, `ROADMAP.md`, and the governing contracts in
`docs/` take precedence.

## Start here

Work in `/workspaces/WatchZone`. Before changing code, read the required
contracts, then verify `git status`, `git log -1`, and
`custom_components/watchzone/const.py`; do not trust this snapshot over the
repository. Preserve unrelated changes. The user owns commits and syncs.

## Baseline

- Branch: `main`.
- HEAD before this work: `580ac5e` —
  `v0.0.4-dev.490 - fix(controls): keep talk side controls transparent`.
- Version being prepared: `0.0.4-dev.491`.
- Proposed subject:
  `v0.0.4-dev.491 - feat(talk): retain two-way talk across HA navigation`.

## Persistent two-way talk

- A document-scoped session now owns the active outgoing peer and microphone
  independently of Lit card instances. Removing a card during Home Assistant
  view or dashboard navigation no longer ends an established call.
- Persistence is a global application feature. It is not a Stage module,
  component, placeable, or configurable Stage item.
- The camera that owns the active session continues to show the normal Stage
  controls. The global tile is shown only while that camera surface is absent
  or presenting another camera.
- The tile is a fixed, document-body overlay at bottom center with safe-area
  padding. It spans the viewport at the compact breakpoint and is bounded on
  larger screens, independently of card and dashboard layout.
- Closing the tile ends the call and dismisses its retained target. Pressing
  the tile microphone ends the call but retains the target and tile so the
  same camera can be restarted. Pressing it again restarts the session.
- The camera action returns to the captured Home Assistant route, selects the
  session camera through the existing deep link, and scrolls the matching
  WatchZone surface into view. The tile then yields to the normal controls.
- Camera switching or card removal preserves a connected call. An incomplete
  connection attempt is cancelled if its initiating surface leaves. Background
  and frozen-document policy still closes and dismisses the session.
- The global tile is lazy loaded only when talk is first started. Shared
  soundwave rendering moved to `frontend/src/ui/` so neither presentation
  imports the other.

## Other active baselines

- Full Stage moves the same stable linked-light and TWT component nodes between
  Camera controls below 600px and activity navigation at 600px and wider.
- Only `overlay` presentation consumes overlay tokens. Every non-overlay
  placement uses generic HA-theme-aware capability tokens.
- `ptz-panel` is an independent Stage module containing the portable PTZ
  component. Panel `+/-` use Camera display zoom, not optical PTZ.
- Events is absent from built-in Stage JSON but remains a registered lazy module
  for future Stage Designs.
- HA control-WebSocket interruption does not destroy a healthy retained media
  transport. Visible recovery promotes stalled work immediately.
- Shared zoom/pan and shared media-stage resize remain the sole owners of those
  behaviors for live and recorded media.

## Validation for `dev.491`

- Formatting, lint, typecheck, architecture/style/license checks, production
  build, and version synchronization pass.
- Unit tests: 523/523 across 79 files.
- Browser tests: 174/174 across Chromium, Firefox, and WebKit.
- Browser assertions cover the normal-control/global-tile handoff, connected
  call retention across camera changes, retained restart behavior, navigation
  back to the session camera, compact full-width layout, bounded desktop
  layout, and responsive relocation of the normal controls.
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
