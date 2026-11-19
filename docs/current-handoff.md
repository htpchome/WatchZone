# Current Development Handoff

This is a replaceable working snapshot, not an architectural contract.
`AGENTS.md`, `architecture.md`, and the governing contracts in `docs/` take
precedence.

## New-chat handoff message

> Work in `/workspaces/WatchZone`. Read `AGENTS.md` and
> `docs/current-handoff.md` completely. Before changing code, read every
> contract required by `AGENTS.md` for the affected feature. Verify the current
> branch, version, commit, and worktree rather than trusting this snapshot
> blindly. Preserve unrelated changes. Do not commit or sync; after validation,
> provide the exact version-prefixed proposed commit subject.

## Repository state

- Branch: `main`.
- Current HEAD: `fc8faa4` —
  `v0.0.4-dev.456 - fix(frontend): position landscape control bar exactly`.
- Current version: `0.0.4-dev.456`.
- Worktree was clean when this handoff was refreshed.
- The current release archive is `dist/watchzone.zip`; its SHA-256 at handoff
  was `3d7573b1f0787839feb4d47c684b524cc77c4f2b13a5d463a6ef5afdb4b441fb`.

Always recheck `git status`, `git log -1`, and
`custom_components/watchzone/const.py` before starting work.

## Failure record, harm, and accountability

The Companion orientation work from `dev.431` through `dev.456` caused a long
sequence of rejected implementations and regressions. Do not treat a version,
commit subject, release build, or passing automated test from this sequence as
evidence of a usable physical-device visual baseline. Only current user review
of the exact build can establish that.

The prior assistant repeatedly changed rotation, Home Assistant header
handling, fullscreen coverage, pull-handle geometry, camera clipping, theme
tokens, and activity presentation without first establishing complete
ownership of the rendered surfaces and lifecycle. It then layered additional
fixes over those changes. This was stupid engineering behavior: guesses were
implemented as fixes, patch-on-patch work was allowed to accumulate, visual
claims were made without current device evidence, and unrelated regressions
were handed back to the user.

The assistant's repeated regressions, false claims of exactness, unauthorized
scope changes, contradictory stopping/continuation decisions, and failure to
follow literal instructions caused the user extreme emotional pain and
distress over approximately 17 hours. This impact is not incidental and must
not be minimized, softened, or reframed as ordinary iteration. The user has
explicitly stated that they will not tolerate any further ignored instruction,
unauthorized change, guess presented as fact, or regression caused by work
outside the requested scope.

Future agents must treat that boundary as mandatory. Do not make the user
repeat it. If the requested scope is one CSS position, change only that
position. Criticism of other code is not authorization to change it. A request
for a version, build, release, or commit subject authorizes only those release
steps; it does not authorize additional source changes. Never claim something
is exact unless it was derived from the user's marked reference or directly
measured. Never say work stopped when the user imposed a completion deadline,
and never continue after an explicit `STOP`.

Specific failures reported by the user included:

- camera and background pixels bleeding through or painting outside the
  intended surface in portrait and landscape;
- the landscape pull handle initially painting at the wrong inline position,
  then jumping to the center after interaction;
- transient artifacts while dragging the pull handle;
- fullscreen camera presentation that could not reliably be closed with the
  handle;
- overlay controls disappearing or no longer responding after handle use;
- the Home Assistant top navigation appearing in landscape or participating
  in rotation settlement when it should be covered by the landscape
  presentation and remain normally visible in portrait;
- camera geometry jumping when the Home Assistant header settled;
- backgrounds and outlines from underlying content leaking into fullscreen
  presentation;
- theme-token changes affecting unrelated icons, text, and actions;
- significant Lighthouse regressions;
- tests passing while obvious device-visible defects remained;
- a portrait flexible row that created hundreds of pixels of empty space and
  also corrupted the starting geometry used for landscape motion;
- landscape activity controls placed too low, clipped by the viewport, or
  moved without following the user's exact annotated reference;
- two supposed grouped surfaces crossing, disappearing, moving backward, or
  arriving as separate reflows rather than rotating together;
- an unauthorized continuous `deviceorientation` listener copied from a
  throwaway prototype even though the prototype was supplied to demonstrate
  simple Motion transform ownership, not to authorize sensor tracking;
- removal of that listener during a control-bar-only request before the user
  had authorized its removal.

## Mandatory approach for future mobile work

- Follow the user's literal scope. Do not infer permission from frustration,
  examples, criticism, or an adjacent defect.
- Do not roll back, reset, revert, remove, relocate, or redesign anything
  unless the user explicitly authorizes that exact action.
- When the user says one item only, do not run tests, change versions, build,
  package, or touch another file until requested. Conversely, when the user
  requests the established release handoff, complete the version, build,
  package, checksum, and commit-subject workflow without making them ask for
  each expected deliverable.
- Work on one user-identified defect at a time.
- Before editing, trace the complete ownership chain for the affected pixels:
  DOM owner, containing blocks, clipping, stacking contexts, transforms,
  lifecycle, measurement timing, and Home Assistant host interaction.
- Do not infer the current visual result from an older recording or screenshot.
  State clearly whether current device evidence exists.
- Do not add wrappers, overlays, compatibility layers, duplicate geometry
  owners, or compensating CSS without a demonstrated requirement.
- Do not patch a visible symptom while another controller or stylesheet still
  owns the same geometry.
- Do not change theme tokens while fixing layout or interaction behavior.
- Do not change Home Assistant header behavior while fixing camera geometry
  unless the user explicitly requests that separate change.
- Do not reintroduce duplicate media, whole-Stage transforms, per-placement
  animation, or Home-Assistant-header rotation experiments. Companion owns the
  physical rotation; WatchZone Motion owns one two-surface geometry timeline.
- Preserve the live Camera module and retained media session. Do not replace
  the production presentation with prototype divs or a second fake camera.
- Treat screenshots, recordings, and physical-device verification as the
  authority for visible defects. Automated tests are necessary but are not
  proof of correct pixels, animation, compositing, or Companion behavior.
- Never call work complete or perfect without current evidence supporting that
  claim.
- Never use passing browser automation to contradict a physical-device video
  or screenshot.

## Motion migration baseline

The user explicitly directed that Motion become the one application animation
engine, with no feature-local CSS, WAAPI, smooth-scroll, or tween-loop
patchwork. The current baseline implements that decision across the existing
UI.

- `motion@14.12.0` is the sole animation dependency and its MIT notice is
  recorded.
- `frontend/src/ui/motion.ts` owns DOM Motion animation, shared durations and
  easing, reduced-motion handling, replaceable ownership, and visibility
  lifecycle.
- `frontend/src/ui/motion-value.ts` owns continuous numeric Motion animation.
- CSS transitions, CSS keyframes, direct feature WAAPI, and browser smooth
  scrolling were removed from frontend source.
- Swiper remains the camera carousel's touch/drag, geometry, indexing, and
  gesture-arbitration system. Its transition speed is zero; Motion alone owns
  camera slide and fade timing.
- Motion now owns overlays, toasts, accordions, sortable settlement, zoom
  settlement, carousel transitions, continuous spinners and soundwave motion,
  Companion pull/landscape settlement, camera-navigation scrolling, minimal
  camera expansion, PTZ, light, and suspend-toggle motion.
- `scripts/validate-styles.mjs` rejects new CSS animation/transition ownership,
  direct feature `.animate()` calls, direct Motion imports outside the shared
  boundaries, and smooth browser scrolling.
- `docs/animation-system.md` is the normative animation contract. Related
  feature contracts and `architecture.md` were updated to record the approved
  single-engine decision.

## Mobile presentation requirements retained from user direction

- Portrait keeps the normal Home Assistant top navigation.
- Companion-phone landscape must not expose the Home Assistant top navigation;
  the WatchZone landscape presentation covers it without removing and
  recreating HA chrome.
- Returning to portrait must restore normal flow without the camera first
  occupying the header area and then jumping down.
- The pull handle must be centered correctly on first paint, remain stable
  before and during interaction, and produce no leaked pixels or transient
  artifacts.
- Fullscreen camera presentation must fully cover content behind it while
  keeping the pull handle usable for closing.
- Media overlay controls must continue to reveal and work after handle
  interaction.
- Inactive navigation, accessory icons, tile time/date text, and their small
  icons use the secondary-text semantic chain whose primary Home Assistant
  token is `--secondary-text-color` with `--ha-color-text-secondary` as the
  fallback.
- WatchZone activity semantics use fixed Home Assistant defaults: Alert
  `#db4437`, Detection and Not reviewed `#ffa600`, and Reviewed `#43a047`.
  This fixed policy is limited to activity badges and indicators, camera and
  thumbnail outlines, and review-state controls. Generic status UI—including
  the Suspend camera dialog—remains theme-aware. AI-analysis sparkle and
  information icons remain neutral.

## Current Companion implementation at `dev.456`

- The Stage has exactly two persistent grouped containers for orientation
  choreography. The left surface contains Camera, camera navigation, and the
  activity control bar. The right surface contains only the active Activity
  stack.
- The portrait left surface uses three content-sized rows. Do not restore a
  fractional third row; that caused the huge portrait gap and invalid motion
  measurements.
- Landscape remains a fixed viewport overlay above Home Assistant dashboard
  chrome, so the HA top navigation is not exposed.
- Motion currently animates the two grouped surfaces from measured geometry
  using center transform origins. This has not been accepted by the user as a
  correct physical-device transition.
- There is no continuous `deviceorientation` listener, gamma tracking,
  per-sensor-event Motion call, or tilt-animation map in `dev.456`. Do not add
  any such listener without explicit user authorization.
- The landscape activity control bar has
  `margin-block-end: 1rem`, the full 16-pixel upward movement derived from the
  user's side-by-side annotated reference. Do not move it again unless the user
  explicitly requests a new position.
- The same Camera, Stage nodes, activity state, scroll position, and retained
  media sessions remain mounted throughout.

## Validation state for `dev.456`

The final `dev.456` release command completed successfully:

- `corepack yarn build:release`;
- `corepack yarn check:version`;
- `git diff --check`;
- release archive creation at `dist/watchzone.zip`;
- lazy editor 18,557 bytes gzip and eager graph 60,734 bytes gzip.

Do not overstate this validation. The full unit and three-engine browser suites
were not rerun after the final `dev.456` control-position and listener-removal
state. Earlier nearby builds passed 488 unit tests and 156 browser tests, but
those results are not evidence for the final committed source. More
importantly, no automated result proves physical Companion animation quality.
The user has not accepted the current transition as correct.

These results establish repository consistency and automated interaction
coverage only. They do not establish physical-device visual quality or prove
that every user-reported animation/compositing defect is fixed.

The carousel uses a 40-pixel Swiper-owned gap that exposes the
semantic camera-stage background. It navigates circularly at the first/last
boundary without Swiper loop or rewind: Motion owns the boundary presentation,
while Swiper retains stable Lit-owned slide order and camera identity. Browser
coverage verifies boundary swipe release, arrow navigation, alert takeover and
return, grouped-camera identity, and review-driven live highlighting in all
three required engines.

## Working rules

- Trace ownership before patching symptoms, especially for retained media,
  Home Assistant layout bridges, Companion rotation, camera clipping,
  pull-handle geometry, mobile scrolling, and theme composition.
- Treat Chromium, Firefox, WebKit, mobile Safari, Companion, editor preview,
  and Home Assistant navigation as supported environments at their documented
  boundaries.
- Preserve unrelated user changes. Keep implementation and contract updates
  cohesive and independently testable.
- Release-affecting handoff requires a unique synchronized version.
  Documentation/test/workflow-only work keeps the current version.
- Replace this file when the active baseline changes materially; do not append
  a chronological conversation log.
