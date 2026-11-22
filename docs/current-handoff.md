# Current Development Handoff

This is a replaceable working snapshot, not an architectural contract.
`AGENTS.md`, `architecture.md`, `ROADMAP.md`, and governing documents take
precedence.

## Current state

- Branch: `main`.
- HEAD: `f967478`.
- Application version: `0.0.5-dev.25` (uncommitted compatibility fix).
- Home Assistant config-entry schema: **2**.
- The working tree contains the follow-up Android/WebView runtime compatibility
  fix described below; no live-session lifecycle policy changed.
- The fresh `dev.25` release package is 889,805 bytes with a 59,462-byte eager
  graph and a 19,568-byte lazy editor entry.
- `dev.17` through `dev.22` did not solve the reported background recovery
  failure and must not be treated as successful work.

## Android and legacy browser compatibility fix

An Android Companion client using Android System WebView 86 could not register
`camera-optics-card`; Home Assistant displayed "Custom element doesn't exist."
The repository had not declared a browser build target, so Vite 8 silently used
its Chrome 111 default and emitted class static blocks that WebView 86 cannot
parse.

The published `dev.23` fix:

- Pins the production build to Home Assistant's legacy frontend floors:
  Chromium/Android WebView 67, Edge 79, Firefox 98, and Safari/iOS 15.4.
- Adds a target regression test and rejects emitted class static blocks during
  release validation.
- Lazily loads the toast presentation and optional Stage Management and
  Interaction editor sections to keep the compatibility build within existing
  eager and editor budgets; their behavior remains covered by tests.
- Updates the platform contract and synchronized release metadata.
- Passed formatting, lint, type checking, all 562 unit tests, a fresh production
  build, build validation, version validation, release packaging, and all 180
  Playwright tests across Chromium, Firefox, and WebKit.

Physical Android testing then proved that registration and Events loaded, but
Live failed and recorded-media opening was unreliable. Running the production
bundle in archived Chromium 86 reproduced an unhandled `e.at is not a function`
error. The build target had corrected syntax but could not polyfill the three
application calls to `Array.prototype.at()`, an API introduced after WebView 86.

`dev.24` replaced all three application calls with baseline-compatible indexing
in live-session retention selection, activity pagination, and activity
grouping. Physical WebView 86 then proved that release was still broadly
broken: Events rendered, but Review tiles did not open media, Live appeared
empty, recorded media collapsed, and positioning was scattered. It must not be
treated as a successful Android compatibility release.

The underlying second failure was CSS compatibility. Chromium 86 does not
support the `inset` shorthand, logical inset properties, or CSS
`aspect-ratio`. CameraOptics had 69 affected declarations in colocated Lit style
modules. Vite's JavaScript target does not transform CSS embedded in TypeScript
template literals, and the current-engine browser matrix could not expose that
gap. Direct Chromium 86 measurement showed the Review tile's transparent click
layer at zero width and recorded/live media stages at zero height.

The uncommitted `dev.25` follow-up:

- Expands logical and shorthand inset declarations in colocated style modules
  with physical positioning fallbacks at build time while retaining modern CSS.
- Gives the Review tile player an explicit full-size hit area.
- Supplies shared `ResizeObserver`-owned pixel heights for camera and recorded
  media stages when CSS `aspect-ratio` is unavailable.
- Runs a compatibility bootstrap before Lit and application imports, providing
  only the runtime and DOM features absent at the Chromium 67 floor that the
  application actually uses.
- Exercises the compatibility bootstrap and nonzero recorded-media geometry in
  browser regression coverage.

The actual production bundle now passes direct engine checks in both archived
Chromium `86.0.4240.0` and Chromium `67.0.3396.0`. In Chromium 86, a real Review
tile click succeeds; the hit area is `388×115.1875`, the recorded viewport is
`372×209.25`, and the live camera viewport is `395.96875×222.71875`. In
Chromium 67, the card registers, the camera stage is `783.9375×440.9375`, the
recorded dialog is `784×625.484375`, and its media viewport is `728×409.5`.
These checks prove registration, interaction dispatch, and layout in the old
engines. Actual Android media playback still requires final physical Companion
verification; the local transport fixture does not prove a device decoder or
network path.

Validation passes formatting, lint, type checking, all 567 unit tests, a fresh
production build, build and version validation, and release packaging.
Chromium and Firefox passed their full browser projects in the 183-test matrix;
WebKit's single rotation timing assertion failed once, passed on focused retry,
and then all 61 WebKit tests passed in a clean project rerun.

The supplied Android logcat excerpt contains no frontend JavaScript exception
or failed CameraOptics asset request. It does show AVC decoders created for
`640×480` and `1920×1080` media and one decoder released. The surrounding
BufferQueue and codec-release messages are native media teardown evidence, not
a demonstrated CameraOptics failure, so they did not justify a speculative
transport change.

## Total failure of background live recovery work

The requirement was straightforward: on non-phone browsers, keep MSE and HLS
alive for two hidden minutes, then completely tear them down. Returning should
start a fresh connection as quickly as an ordinary fresh connection. WebRTC
already retained acceptably.

The agent failed to deliver this after roughly ten turns and several releases.
The original Home Assistant HLS problem expanded until HLS on other sources and
MSE were also affected. The user continued to experience an approximately
15-second return while fresh Home Assistant HLS took about one second.

### Failed sequence

1. `dev.17` parked and resumed HLS after expiration, contradicting the explicit
   requirement to tear it down.
2. `dev.18` destroyed the media connection but retained and reconnected inside
   the same managed session. The delay remained.
3. `dev.19` replaced the entire managed session. The delay remained.
4. `dev.20` changed expiration and delayed replacement until an animation
   frame. The delay remained and regressions spread to other HLS and MSE paths.
5. The agent repeatedly fixated on the HLS adapter's 15-second timeout without
   proving where the wall-clock delay occurred across the whole application.
6. Timing evidence showed successful starts of approximately 117 ms for Home
   Assistant HLS, 200 ms for Frigate HLS, and 1.1 seconds for Home Assistant
   HLS. This showed the recorded successful HLS pipeline was fast and the
   visible delay was outside it or hidden by overwritten attempt data.
7. The agent still did not provide a fix and instead spent more of the user's
   time adding diagnostics after making speculative lifecycle changes.
8. `dev.21` failed CI packaging because its eager graph was 61,489 bytes, above
   the 61,440-byte validation limit. The agent had handed it back as testable.
9. The agent's earlier local 61,389-byte result was stale: the packaging script
   validates existing `dist/frontend` files but does not rebuild them. The
   agent failed to run a fresh build before claiming release validation.
10. `dev.22` reduced diagnostics and eager metadata but still did not solve the
    15-second behavior.
11. The user ordered a byte-for-byte rollback. The agent restored the local
    `v0.0.5-dev.16` tag, then mishandled whether the version should be `dev.16`
    or `dev.23`, briefly creating unwanted version-only working-tree changes
    after being told to stop.

## Why this was unacceptable

- The agent changed session ownership, teardown, retry, and reacquisition before
  obtaining evidence identifying the delay's owner.
- It ignored repeated direction to examine the whole system and both connection
  sources rather than one HLS path.
- It generalized between Home Assistant, Frigate, HLS, MSE, and WebRTC without
  sufficient evidence.
- Mocked tests checked state transitions and factory calls, not the real
  requirement: a physical hidden browser tab must return quickly to an
  advancing frame.
- Hundreds of passing tests were presented as reassurance while the actual
  behavior remained broken.
- The agent handed back test, validation, and eager-graph failures despite the
  user explicitly objecting to failed handoffs.
- It validated stale generated output and reported it as a current production
  build.
- It consumed hours on speculative changes, repeated explanations, and
  diagnostics without solving the user's problem.
- It introduced broader regressions into behavior that had previously worked.
- It created additional confusion and unwanted changes during the final
  rollback and version handoff.

## Do not resume the failed approach

- Do not reconstruct or selectively reapply `dev.17` through `dev.22`.
- Preserve `dev.16` unless the user explicitly requests another change.
- Do not change live lifecycle code without an end-to-end physical-browser
  reproduction measuring foreground return through the first advancing frame.
- Do not infer that an observed 15-second delay proves the HLS adapter owns it.
- Test Home Assistant and Frigate separately. Test HLS, MSE, and WebRTC
  separately.
- Do not treat fake timers, mocked video elements, or a factory invocation as
  proof of real browser behavior.

## Earlier backend schema failure

The agent explicitly raised the Home Assistant config-entry schema from 2 to 3
for experimental subentries and later from 3 to 4 for cleanup. Neither change
was justified by a real persisted-data transformation. Returning to schema-2
code then left Home Assistant unable to load the higher-schema entry. The agent
initially blamed Home Assistant rather than acknowledging that CameraOptics had
declared both schema changes. The user ultimately removed and reinstalled the
integration.

Keep `CameraOpticsConfigFlow.VERSION` at **2**. Application SemVer and Home
Assistant config-entry schema are independent. Never use a major schema bump as
a development marker or cleanup mechanism.

## Earlier backend failure-boundary failure

When the Python integration failed, the frontend continued partial work,
displayed misleading empty states and stale presentation, accumulated errors,
and contributed to browser lockups. The attempted failure-boundary patch was
incomplete, mixed unfinished files into the working tree, failed its first
test, and was discarded. Do not restore it blindly.

## Mandatory handoff rules

- Follow the user's literal request; do not redesign adjacent systems.
- A question is not authorization to edit, remove, restore, stage, or commit.
- Never stage or commit. The user owns commits.
- Inspect the complete working tree before giving a commit subject.
- Always run a fresh frontend build before package validation.
- Never hand back test, build, eager-graph, or packaging failures.
- Report exactly what was and was not validated.
- Physical behavior, recordings, screenshots, and user timing outrank mocked
  test success.
- Stop immediately when the user says stop.
