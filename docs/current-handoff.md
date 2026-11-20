# Current Development Handoff

This is a replaceable working snapshot, not an architectural contract.
`AGENTS.md`, `architecture.md`, and the governing contracts in `docs/` take
precedence.

## New-chat handoff

> Work in `/workspaces/WatchZone`. Read `AGENTS.md`, `architecture.md`,
> `ROADMAP.md`, and `docs/current-handoff.md` completely. Before changing code,
> trace the affected system and read every contract required by `AGENTS.md`.
> Verify the branch, version, HEAD, and worktree rather than trusting this
> snapshot. Preserve unrelated changes. Do not commit; after each completed
> turn, provide an exact version-prefixed proposed commit subject.

## Repository baseline

- Branch: `main`.
- HEAD before the current toolbar-control correction: `ec0bfe3` —
  `v0.0.4-dev.486 - fix(controls): refine toolbar talk and light presentation`.
- Version being prepared: `0.0.4-dev.487`.
- The user remains the commit owner. No agent commit or sync is authorized.

Always recheck `git status`, `git log -1`, and
`custom_components/watchzone/const.py` before starting work.

## Failed camera-controls work removed at `dev.479`

## PTZ panel refined at `dev.482`

The Full Stage activity stack now includes a dedicated `ptz-panel` module
after Exports when at least one configured main camera has PTZ enabled.

- The round PTZ stack selector appears only while the displayed physical
  camera is in the configured PTZ scope. Switching to a non-PTZ camera while
  the panel is active returns the stack to Reviews.
- `ptz-panel` is a real Stage module with a stable draggable identity. Its
  `content` slot composes the independently loaded PTZ component; neither
  placeable imports the other.
- The PTZ component has a separate panel presentation with the directional
  control and up to six provider-reported preset buttons. The existing Camera
  overlay presentation retains its prior behavior and layout.
- Frigate preset recall is provider-normalized and finite. It calls the
  Frigate PTZ service once with `action: preset` and the exact preset name; it
  does not create a movement subscription or send Stop after recall begins.
- The public provider extension API is version 6 because PTZ provider motion
  now includes optical zoom as well as pan/tilt, in addition to preset recall.

The `dev.483` correction keeps the shared circular wedge geometry and restores
the center split with the semantic divider token. The panel `+` and `-` always
drive Camera's existing display-zoom owner and never inspect or invoke provider
optical zoom.

## Live recovery corrected at `dev.483`

- Home Assistant control-WebSocket interruption no longer destroys a healthy
  live or parked media transport, and the last sanitized HA entity state stays
  available so modules do not tear down or produce a toast storm.
- A failed or background-stalled active connection is promoted immediately
  when the browser document becomes visible, bypassing background-throttled
  retry and adapter timeout delays. The active player is resumed in place.
- Frigate MSE remains as a bounded parked fallback after WebRTC takeover. It
  drops media while parked and seeks to the live edge on resume, avoiding a
  cold 15-second MSE startup when fallback is needed.
- These changes do not broaden retention past the existing document lifetime,
  Companion reduced-bandwidth policy, lease release, or session eviction.
  Destroying the WebView/document still releases browser-owned resources.

This work is uncommitted; the user remains the only commit owner.

## Toolbar control refinement at `dev.486`

- Wide Full Stage keeps the two-way-talk component exactly centered and places
  linked lights before it with a shared control gap.
- Two-way talk retains its translucent soundwave presentation on Camera
  overlays. Toolbar presentation preserves the same pill, transparent side
  buttons, and visible soundwave while applying semantic Home Assistant-aware
  panel, border, and icon colors.
- The active center microphone remains green while live and changes to the
  fixed WatchZone detection-warning color while its outgoing microphone is
  muted. Hover preserves either active color.
- Linked-light controls and editor affordances now use Home Assistant
  `ha-icon` with `mdi:lightbulb` as the default; the duplicate WatchZone
  lightbulb SVG was removed.

## Events removed from built-in Stages at `dev.484`

The standard and mobile built-in Full Stage templates no longer include the
Events module in either responsive variant. Events remains a registered,
independently lazy-loaded module for future user-created Stage Designs.
Because no built-in layout references it, ordinary cards do not import the
Events implementation, create its element, subscribe its controllers, or
request an Events list. Backend command and provider registration remains
inert until a future layout or an explicit event deep link requests data.

## Activity presentation policies and responsive controls at `dev.485`

- Alert and Detection Highlight replaces the legacy live-camera highlight
  toggle with `off`, `alerts`, `detections`, and `both`; `both` is the default.
  It filters presentation only and remains independent from takeover.
- Reviews has its own Alert and Detection Thumbnail Outline policy with the
  same values and default. It controls only thumbnail outlines and leaves
  badges and underlying activity data intact.
- In Full Stage, linked-light and two-way-talk keep their Camera-overlay
  placement below 600px. At 600px and wider, the declarative Stage variant
  moves the same stable component nodes into the centered activity-navigation
  content slot with toolbar presentation. Camera Only keeps them in Camera at
  every size. Components do not choose the breakpoint or import either host.
- The PTZ panel background begins after a shared Stage module gap so it is
  visually separated from the activity-navigation controls.

This work is uncommitted; the user remains the only commit owner.

## Current recorded-media baseline

The bottom-drawer recorded-media presentation was rebuilt and accepted by the
user at `dev.476`.

- `frontend/src/ui/media-stage-resize.controller.ts` is the shared media-stage
  resize controller. Live camera presentation and the recorded-media drawer
  both consume it.
- `frontend/src/ui/zoom/` is the sole owner of camera-display zoom and pan
  transforms for live video, recorded video, and recorded snapshots.
- The drawer owns only drawer concerns: opening, closing, width, header,
  footer, and the available stage boundary. It does not fit, center, zoom,
  pan, or independently transform media.
- The old drawer-only resize controller and the drawer-specific presentation
  height path were removed.
- Recorded video and snapshots use a stable media host and transform the actual
  media target. They remain centered throughout pull-down resizing.
- The recorded-video transport remains a separate sibling outside the zoomed
  media target, so playback controls do not scale or pan with the video.
- The pull handle stops fully above the footer action area.
- Source aspect ratios are preserved. Do not assume every camera is 16:9.
- `docs/camera-display-zoom.md` and `docs/recorded-media-player.md` govern this
  behavior.

## Overall engineering lesson

Separation of interests is a functional requirement, not organizational
decoration. A feature must own one coherent responsibility and expose a narrow
contract. Presentation shells arrange content. Capability systems implement
behavior. Data and lifecycle owners maintain state. When those responsibilities
are mixed, consumers cannot reuse behavior safely, fixes acquire unintended
side effects, and maintainers cannot identify which code controls a visible
result.

Uniform systems are equally important. The same capability must have the same
owner and semantics everywhere it is used:

- zoom and pan come from one camera-display zoom system;
- media-stage resizing comes from one shared resize system;
- PTZ, two-way talk, fullscreen, media sessions, animation, and other shared
  capabilities must likewise have one governed implementation and narrow
  consumer hooks;
- live, recorded, snapshot, modal, drawer, Stage, and future Stage Designer
  contexts may compose those capabilities differently, but must not re-create
  them privately.

Uniformity means a defect is corrected once, interaction behavior stays
consistent, tests describe one contract, and a future presentation can attach
an existing capability without copying presentation code. Without uniformity,
every new view becomes another implementation to debug and eventually behaves
differently from the others.

The five-hour drawer failure demonstrated the cost directly. Shared zoom
already owned the media transform, but the drawer introduced a second
presentation-height transform path and intrinsic CSS geometry. Both systems
owned the same pixels. During pointer movement they disagreed, so the video
shifted while dragging and corrected only after release. Repeated offsets,
timing changes, and settlement patches could not make conflicting ownership
reliable. Once the competing path was removed and the proven shared live-media
behavior was reused, the correction was small and direct.

Future agents must therefore:

- Map the complete interaction before editing: data flow, DOM target, state
  owner, listeners, gesture arbitration, transforms, containing blocks,
  clipping, measurement timing, lifecycle, and cleanup.
- Identify the single owner for each concern. If ownership cannot be stated
  clearly, do not edit yet.
- Reuse a proven shared capability when semantics are the same. Different
  layouts, containers, or media sources do not justify duplicate behavior.
- Keep consumers thin. They supply context and typed intent; they do not
  reproduce capability logic.
- Never combine model/data ownership, capability policy, and presentation
  merely because one screen currently uses all three.
- Do not hide duplicate behavior behind similarly named wrappers or helpers.
  Extract the stable shared boundary and remove the competing implementation.
- When two systems own the same pixels, state, event, or lifecycle, stop and
  correct the boundary. Do not synchronize them with offsets, delays,
  callbacks, compensating CSS, or cleanup patches.
- Diagnose the first frame or event where behavior diverges, not only the
  final settled result. Correct final state can conceal fighting systems.
- Design current boundaries so future Stage Designer modules and components
  can compose capabilities without importing or mutating one another.
- Treat user recordings and physical-device observations as evidence.
  Automated tests are necessary but do not overrule visible behavior.
- Never claim success without evidence, and never promise a fix before the
  ownership and failure mechanism are understood.
- Follow literal scope. Analysis of adjacent architecture is not authorization
  to change it.
- Never commit. The user commits. Always provide a proposed commit subject.

## Mobile and Companion boundaries

- Companion owns physical device rotation. WatchZone owns its presentation
  geometry and Motion timeline.
- Portrait retains normal Home Assistant navigation. Companion-phone
  landscape covers it with the WatchZone landscape presentation.
- The live Camera module, Swiper identity, retained media session, activity
  state, and scroll state must remain mounted through presentation changes.
- Motion is the only frontend animation engine. Swiper owns carousel gesture,
  indexing, and slide geometry; it does not own transition animation.
- Do not add continuous device-orientation tracking, duplicate media,
  whole-Stage transforms, CSS transitions, WAAPI calls, or feature-local tween
  loops without an explicitly approved architectural change.
- Read `docs/live-session-lifecycle.md`, `docs/camera-carousel.md`,
  `docs/camera-presentation-layout.md`, `docs/camera-display-zoom.md`,
  `docs/animation-system.md`, and `docs/platform-compatibility.md` before
  changing these systems.

## Validation inherited from `dev.476`

Completed successfully:

- formatting, typecheck, lint, version synchronization, and production build;
- 504 unit tests across 77 files;
- recorded-media drawer and broader recorded-media interaction coverage in
  Chromium, Firefox, and WebKit;
- `git diff --check`.

The full browser run reached 162 passing tests. One unrelated known assertion
still fails in all three engines: the Companion 60/40 landscape test expects
the activity navigation bottom at 382px and receives 374px. Do not describe
the complete browser matrix as passing until that separate 8px discrepancy is
resolved or the governing expectation is deliberately changed.

Physical Home Assistant Companion testing remains the authority for device
rotation, compositing, native fullscreen, and touch behavior. Browser tests do
not prove those pixels.

## Working rules

- Trace first; edit second.
- Preserve one owner per state, transform, gesture, and lifecycle.
- Keep feature boundaries narrow and avoid generic dumping grounds.
- Preserve unrelated user changes and do not broaden scope without approval.
- Do not edit architectural contracts merely to document implementation.
- Do not create placeholders, speculative abstractions, compatibility layers,
  or empty directories.
- A release-affecting handoff requires a unique synchronized version.
  Documentation-only work keeps the current version.
- Replace this file when the active baseline materially changes; do not turn
  it into a chronological conversation log.
