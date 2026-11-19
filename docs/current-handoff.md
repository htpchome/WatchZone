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
- Current HEAD: `b3c26e0` —
  `v0.0.4-dev.445 - test(frontend): harden circular carousel coverage`.
- Pending version: `0.0.4-dev.446`.
- Worktree: the Companion-phone orientation transition described below is
  intentionally uncommitted together with the scoped activity-color correction.
  There were no unrelated local changes when this work began.
- Proposed commit subject:
  `v0.0.4-dev.446 - fix(frontend): coordinate orientation and activity semantics`.

Always recheck `git status`, `git log -1`, and
`custom_components/watchzone/const.py` before starting work.

## Failure record and accountability

The work from `dev.431` through `dev.441` is rejected. Do not treat any of
those versions, their commit subjects, or their passing automated tests as
evidence of a usable visual baseline.

The prior assistant repeatedly changed rotation, Home Assistant header
handling, fullscreen coverage, pull-handle geometry, camera clipping, theme
tokens, and activity presentation without first establishing complete
ownership of the rendered surfaces and lifecycle. It then layered additional
fixes over those changes. This was stupid engineering behavior: guesses were
implemented as fixes, patch-on-patch work was allowed to accumulate, visual
claims were made without current device evidence, and unrelated regressions
were handed back to the user. The result cost the user a full day of work and
destroyed confidence in the implementation and validation process.

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
- tests passing while obvious device-visible defects remained.

The user explicitly rejected whole-version rollback as a general debugging
strategy because each version also contained unrelated work. The restoration
to `dev.430` was later requested only as an emergency recovery action after the
subsequent implementation became unusable. Do not infer that `dev.430` is
perfect or that every pre-431 behavior is accepted. It is the user-selected
recovery baseline, nothing more.

## Mandatory approach for future mobile work

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
- Do not reintroduce the rejected per-module, duplicate-surface, or
  Home-Assistant-header rotation experiments. The user explicitly reopened
  orientation work for one Motion-owned Stage-surface transition.
- Preserve the live Camera module and retained media session. Do not replace
  the production presentation with prototype divs or a second fake camera.
- Treat screenshots, recordings, and physical-device verification as the
  authority for visible defects. Automated tests are necessary but are not
  proof of correct pixels, animation, compositing, or Companion behavior.
- Never call work complete or perfect without current evidence supporting that
  claim.

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

## Pending Companion orientation correction

- Companion continues to own physical WebView rotation. WatchZone commits its
  final responsive state and uses one Motion transition on the stable Stage
  surface; it no longer transforms each Stage placement independently.
- Landscape remains a fixed viewport overlay above Home Assistant dashboard
  chrome, so the HA top navigation is not exposed.
- The first portrait resize releases the fixed overlay immediately. Home
  Assistant flow then decides the card's real top position: an enabled header
  places it below the header, while a disabled header adds no phantom offset.
- Motion derives rotation direction from the exposed orientation angle when
  available, has a deterministic fallback, cancels cleanly on reversal, and
  becomes immediate under reduced-motion preference.
- The same Camera, Stage nodes, activity state, scroll position, and retained
  media sessions remain mounted throughout.

## Validation baseline for pending `dev.446`

The current baseline passes:

- `corepack yarn check:version`;
- `corepack yarn format`;
- `corepack yarn lint`;
- `corepack yarn typecheck`;
- `corepack yarn test`: 488 tests passed in 77 files;
- `corepack yarn build`;
- `corepack yarn check:styles`;
- `corepack yarn check:licenses`;
- `bash scripts/package-release.sh`: lazy editor 18,558 bytes gzip and eager
  graph 60,548 bytes gzip, producing `dist/watchzone.zip`;
- `corepack yarn test:browser`: 156 tests passed across Chromium, Firefox, and
  WebKit;
- `git diff --check`.

The browser matrix required permission to bind its local Vite server to
`127.0.0.1:5173`; the initial sandboxed start failed with `EPERM` before any
test ran. The rerun with the required permission completed successfully.

The first unit run passed all 488 assertions but reported three late dynamic
imports from the existing card test after environment teardown. A clean
isolated rerun passed all 488 tests with no unhandled errors.

Focused activity-color, semantic-token, and Companion-orientation coverage
passed 9 tests across Chromium, Firefox, and WebKit. The orientation test
records the Motion invocation rather than sampling a short-lived animation,
and verifies one Stage-surface rotation, no placement animations, immediate
portrait flow restoration, header-present and header-absent geometry,
interruption cleanup, and reduced motion.

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
