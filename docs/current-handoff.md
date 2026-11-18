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
- Current HEAD before the pending rollback: `9bca8a4` —
  `v0.0.4-dev.441 - fix(mobile): stabilize camera pull geometry and eliminate bleed`.
- Pending version: `0.0.4-dev.442`.
- Worktree: the complete tracked tree was restored to commit `c6770b6` —
  `v0.0.4-dev.430 - fix(mobile): synchronize rotation with HA layout settlement`.
- Relative to `c6770b6`, only the three synchronized version fields and this
  handoff differ: `custom_components/watchzone/const.py`,
  `custom_components/watchzone/manifest.json`, `frontend/package.json`, and
  `docs/current-handoff.md`.
- The rollback, version update, and handoff update are intentionally
  uncommitted. The proposed commit subject is:
  `v0.0.4-dev.442 - revert(frontend): restore dev.430 implementation`.

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
- Do not restart rotation-animation experimentation. The user explicitly said
  to forget the desired transition animation after repeated regressions.
- Preserve the live Camera module and retained media session. Do not replace
  the production presentation with prototype divs or a second fake camera.
- Treat screenshots, recordings, and physical-device verification as the
  authority for visible defects. Automated tests are necessary but are not
  proof of correct pixels, animation, compositing, or Companion behavior.
- Never call work complete or perfect without current evidence supporting that
  claim.

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
- WatchZone status semantics use the canonical Home Assistant defaults:
  error `#db4437`, warning `#ffa600`, info `#039be5`, and success `#43a047`.
  Alert/detection and review-state semantics must not be coupled to unrelated
  text or action colors.

## Validation of the pending `dev.442` recovery

The restored tree and version-only update passed:

- `corepack yarn check:version`;
- `corepack yarn format`;
- `corepack yarn lint`;
- `corepack yarn typecheck`;
- `corepack yarn test`: 488 tests passed in 77 files;
- `corepack yarn build`;
- `corepack yarn test:browser`: 156 tests passed across Chromium, Firefox, and
  WebKit;
- `git diff --check`.

The browser matrix required permission to bind its local Vite server to
`127.0.0.1:5173`; the initial sandboxed start failed with `EPERM` before any
test ran. The rerun with the required permission completed successfully.

These results establish repository consistency only. They do not establish
that the user-reported physical-device visual defects are fixed.

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
