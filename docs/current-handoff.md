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
- HEAD before the current correction: `3fcd1f2` —
  `v0.0.4-dev.489 - fix(controls): center talk and match themed controls`.
- Version being prepared: `0.0.4-dev.490`.
- Proposed subject:
  `v0.0.4-dev.490 - fix(controls): keep talk side controls transparent`.

## Current control behavior

- Full Stage moves the same stable linked-light and TWT component nodes between
  Camera controls below 600px and activity navigation at 600px and wider.
- Responsive relocation preserves the active TWT element, peer, microphone
  mute state, and soundwave; a transient DOM reparent is not permanent removal.
- The inactive microphone stays centered. Activity navigation reserves the
  active pill width, so the linked-light button remains fixed when TWT expands.
- Only `overlay` presentation consumes overlay tokens. Every non-overlay
  placement uses generic HA-theme-aware capability tokens, including future
  Stage Designer placements outside activity navigation.
- Active TWT keeps one pill and one visible soundwave canvas. Its two small side
  controls are transparent icon-only buttons in idle, hover, and press states;
  hover may change the icon color but never paints over the soundwave. Only the
  large center microphone owns a circular surface.
- The active center microphone is green, changes to the fixed Detection color
  when outgoing audio is muted, and retains that state on hover.
- Linked-light icons use Home Assistant `ha-icon`; the default is
  `mdi:lightbulb`.

## Other active baselines

- `ptz-panel` is an independent Stage module containing the portable PTZ
  component. It appears only for PTZ-configured main cameras and supports up to
  six normalized provider presets. Frigate preset recall is one finite preset
  action with no Stop. Panel `+/-` use Camera display zoom, not optical PTZ.
- Events is absent from built-in Stage JSON but remains a registered lazy module
  for future Stage Designs; built-in cards do not import it or request its data.
- Alert/Detection live highlight and Review thumbnail outline each use
  `off`, `alerts`, `detections`, or `both`, with `both` as the default.
- HA control-WebSocket interruption does not destroy a healthy retained media
  transport. Visible recovery promotes stalled work immediately, and parked
  Frigate MSE remains bounded and seeks to the live edge on resume.
- Shared zoom/pan and shared media-stage resize remain the sole owners of those
  behaviors for live and recorded media. Do not add presentation-local copies.

## Validation for `dev.490`

- Formatting, lint, typecheck, architecture/style/license checks, production
  build, and version synchronization pass.
- Unit tests: 518/518 across 78 files.
- Browser tests: 174/174 across Chromium, Firefox, and WebKit.
- Focused browser assertions verify centered mic geometry, fixed light
  coordinates, non-overlay theme values, retained TWT across responsive moves,
  and transparent active side-button backgrounds while hovered in both
  standard and overlay presentations.
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
