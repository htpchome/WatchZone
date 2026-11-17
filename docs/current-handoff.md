# Current Development Handoff

This is a replaceable working snapshot, not an architectural contract.
`AGENTS.md`, `architecture.md`, and the governing contracts in `docs/` take
precedence.

## New-chat handoff message

> Work in `/workspaces/WatchZone`. Read `AGENTS.md` and
> `docs/current-handoff.md` completely. Before changing code, read every
> contract required by `AGENTS.md` for the affected feature. Verify the current
> branch, version, commit, and worktree rather than trusting the snapshot
> blindly. Preserve unrelated changes. Do not commit or sync; after validation,
> provide the exact version-prefixed proposed commit subject.

## Repository state

- Branch: `main`
- Version: `0.0.4-dev.391`
- HEAD: `499342e` —
  `v0.0.4-dev.390 - style(ui): add editor shadows and align action corners`
- Worktree: contains the pending `dev.391` Reviews editor reorganization and
  isolated action-radius correction described below.
- Latest package was generated at `dist/watchzone.zip`.

Always recheck `git status`, `git log -1`, and
`custom_components/watchzone/const.py` before starting work.

## Current baseline

### Architecture and stages

- WatchZone remains one mandatory Python integration with a packaged Lit
  frontend. Provider work, layout ownership, theme boundaries, and retained
  media-session rules in `architecture.md` remain in force.
- Built-in Stage JSON is still frontend-owned. Python Stage Design persistence
  and the Stage Designer are intentionally deferred until user-created designs
  require them.
- The editor offers Minimal Camera Stage, Camera Only Stage, and Full Stage.
  Minimal Camera remains deliberately lightweight and does not load the full
  Camera module, carousel, zoom/pan, PTZ, talk, or lights.
- Camera selection is authoritative. Navigation, activity, takeover,
  recordings, and recorded-media flows consume that shared selection.

### Live and recorded media

- Live sessions remain document-scoped and lease-based. Editor transitions,
  HA navigation, dialogs, and ordinary reparenting must preserve healthy
  retained sessions.
- Recorded-media viewers use a manual top-layer popover so theme
  `backdrop-filter` on `ha-card` cannot clip or constrain the draggable dialog.
- Recording dialogs provide playback rates `0.25x`, `0.5x`, `1x`, `2x`, `5x`,
  `10x`, and `25x`; a centered readout supports direct selection.
- Recording segment management supports preview, named Export Segment,
  Download Segment, and whole-recording download. Export feedback belongs to
  the modal surface.
- Reviews, Events, Recordings, and Exports use bounded internal scrolling. A
  shared floating Top control appears at the bottom center only after roughly
  two rendered tile heights of scrolling, stays hidden for non-scrolling
  collections, and smoothly returns that internal viewport to its beginning.

### Card layout and mobile behavior

- Standard devices and physical mobile phones have independent height and
  appearance settings. Physical-client identity, not browser width, selects
  the phone settings.
- Height modes are `auto`, `fit_viewport`, and `fill_container`:
  - `auto` uses natural content height with a five-item media ceiling.
  - `fit_viewport` uses the visible dynamic viewport remaining below the card's
    actual HA position.
  - `fill_container` consumes a definite parent height and otherwise falls
    back to automatic percentage behavior.
- Constrained Full Stage layouts keep the camera/content rows intrinsic and
  give remaining height to the internally scrolling media row. The media row
  retains a measured three-tile minimum; if that cannot fit, the containing HA
  view must scroll. Camera Only and Minimal Camera retain natural height.
- Phone-only edge-to-edge mode may remove HA Sections wrapper/container
  padding through the isolated shared bridge. It does not alter HA grid gaps or
  maximum widths.
- In edge-to-edge `fit_viewport`, WatchZone underlaps the complete bottom safe
  area. Reviews, Events, Recordings, and Exports keep a veil using the exact
  `ha-card` background and backdrop-filter token chain over scrolling media,
  capped visually at `1.5rem`, plus trailing scroll padding for the complete
  hardware inset. Tiles remain visible through glass themes without stranding
  the final tile under the home indicator. The floating Top control is offset
  above the complete hardware inset. Companion applies an equal trailing layout
  overlap without adding that inset to the card viewport height, so HA's own
  safe-area spacing cannot create outer-window scrolling; only the active media
  list scrolls beneath the stationary veil.
- Native Companion pull-to-refresh is preserved. Internal media scrollers hand
  overscroll back to HA; no WatchZone-specific reload gesture exists. On iOS,
  list-origin pulls may require a longer pull-and-hold, consistent with other
  HA nested-scroll pages.
- The unresolved ultra-narrow behavior near 255px differs between Chromium,
  Firefox, and Safari. Investigation was deliberately stopped because the
  layout is below a practical supported card width; do not reopen it without a
  concrete requirement.

### Theme and editor behavior

- Home Assistant theme variables remain isolated to
  `frontend/src/styles/theme-tokens.ts`; feature CSS consumes semantic
  `--wzc-*` tokens only.
- Compact editor segmented controls and Camera Navigation use the exact same
  `--wzc-selection-bar-background`, which resolves to the secondary media-tile
  surface. Editor tracks use the semantic small shadow without an outline.
  Camera Navigation keeps its nested segmented track shadowless and retains its
  independently configurable corners and outer shadow.
- Activity-tile icon actions and recorded-media modal footer actions share the
  same small square corner radius as media-overlay buttons through an
  independent action token. Media-overlay button radius ownership is unchanged.
- Reviews owns the history, thumbnail-preview, object/classification badge,
  and zone-display controls in one divided-row disclosure. The former Display
  Settings disclosure is removed. Layout Settings uses the `mdi:ruler-square`
  icon.
- Card height uses pill-radio controls. Layout appearance is presented in
  Standard and Mobile columns. Minimal Camera does not expose irrelevant
  general layout appearance settings; phone edge-to-edge remains available.
- Editor typing, dirty state, preview, and Save behavior remain owned by the
  top-level editor and isolated HA lifecycle bridge. Closed accordion headers
  retain pending-change highlighting while their bodies are unmounted.

## Deferred decisions

- Do not connect Python Stage Design persistence merely for immutable built-in
  defaults. Revisit with the Stage Designer and user-created Stage Designs.
- Do not make release publication depend on the complete validation workflow
  during prerelease development. The existing GitHub release pipeline remains
  unchanged.
- A read-only normalized backend camera catalog and further download-preparation
  consolidation remain possible later work, not active requirements.

## Budget and validation snapshot

- The architectural eager-entry target remains 50 KiB gzip. The temporary
  release ceiling is 64 KiB with a 4 KiB safety margin.
- At `dev.391`, packaging measured the eager graph at 60,921 bytes gzip.
- The lazy editor measured 19,443 bytes gzip against the 19,456-byte validator
  ceiling. Only 13 bytes remain; keep editor changes compact and measure the
  production output early.
- `dev.391` passed:
  - 482 frontend unit tests;
  - 141 Playwright tests across Chromium, Firefox, and WebKit;
  - formatting, lint, type checking, architecture/style/license validation,
    production build, version consistency, release packaging, and
    `git diff --check`.
- No Python behavior changed in this styling update; only the synchronized
  version constants changed. Do not infer a current Python pytest result from
  the frontend validation above.

## Working rules

- Trace ownership before patching symptoms, especially for retained media,
  Home Assistant layout bridges, mobile scrolling, and theme composition.
- Treat Chromium, Firefox, WebKit, mobile Safari, Companion, editor preview,
  and HA navigation as supported environments at their documented boundaries.
- Preserve unrelated user changes. Keep implementation and contract updates
  cohesive and independently testable.
- Release-affecting handoff requires a unique synchronized version.
  Documentation/test/workflow-only work keeps the current version.
- Replace this file when the active baseline changes materially; do not append
  a chronological conversation log.
