# Current Development Handoff

This is a replaceable working snapshot, not an architectural contract.
`AGENTS.md`, `architecture.md`, `ROADMAP.md`, and governing documents take
precedence.

## Current state

- Branch: `main`.
- HEAD before the current uncommitted change: `7625a7d`
  (`v0.0.5-dev.43`).
- Application version: `0.0.5-dev.44`.
- Home Assistant config-entry schema: **2**.
- The current uncommitted change introduces a shared two-dimensional Stage
  presentation profile and a static compact-to-wide-short mobile Full Stage.
- Both variants preserve two stable groups: Camera plus Camera Navigation, and
  Control Bar plus the active Activity stack.
- The wide-short destination remains in ordinary Home Assistant card flow.
  Fullscreen and FLIP motion are intentionally not part of this foundation.
- The fresh `dev.44` release package validates with a 61,267-byte eager graph
  and is available at `dist/camera-optics.zip`.

## Restored live baseline

`dev.37` preserves the `dev.29` winner-takes-all policy: WebRTC may be retained,
losing MSE/HLS fallbacks are closed, and a foreground hedge can reacquire the
configured fallback. No `dev.31` through `dev.35` recovery change remains.
After `dev.36` failed on GitHub at 61,441 bytes, `dev.37` reapplies only compact
state predicates and messages from the build-focused `dev.30` change. It does
not restore a discarded recovery hypothesis.

The rebuilt `dev.37` package validates locally with a 61,377-byte eager graph,
63 bytes below the repository's 61,440-byte validation limit and 64 bytes below
the failing `dev.36` runner artifact.

## Browser-compatibility rollback

The `dev.23` through `dev.25` attempt to support Chromium/WebView 67 and the
physical Android WebView 86 installation was unsuccessful and destabilized
layout, controls, live video, and recorded-media behavior. That complete
compatibility series has been removed rather than selectively retained.

The restored Vite configuration again uses Vite 8.3.5's implicit
`baseline-widely-available` production target: Chrome 111+, Edge 111+,
Firefox 114+, and Safari 16.4+. This is a syntax-transformation floor, not a
runtime polyfill guarantee. CameraOptics does not claim support for Android
WebView 86 or 108 in this restored state.

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

### Failed `dev.30` through `dev.35` sequence

- `dev.30` only recovered release-budget margin; it did not address the
  physical delay.
- `dev.31` tried to preserve fallback recovery across card recreation.
  Physical testing showed no improvement because card recreation was not the
  proven owner of the delay.
- `dev.32` tried to start fallback when retained WebRTC reconnected. Physical
  testing again showed no improvement. The captured HLS startup itself was
  still fast, while the change continued to infer orchestration behavior from
  incomplete attempt timing.
- `dev.33` forced a fresh transport race after hidden teardown. It broadened
  the regression: WebRTC, HLS, and MSE all exhibited the approximately
  15-second foreground return. It also changed retention behavior before the
  shared delay was isolated.
- `dev.34` deferred foreground startup to a microtask after
  `visibilitychange`. Physical testing showed zero improvement; the event
  dispatch boundary was not the cause.
- `dev.35` attributed the delay to reuse of a stale Home Assistant API wrapper
  and introduced a transport-revision mechanism. This conclusion was not
  established by a physical reproduction before handoff. Passing mocked and
  cross-browser tests did not prove the real foreground-return behavior, so the
  release was not a trustworthy fix and was rolled back with the rest.

The repeated failure was methodological: the agent kept changing retention,
presentation selection, retry ordering, visibility timing, and Home Assistant
API lifecycle from one hypothesis at a time without first capturing one
complete physical timeline from foreground event through candidate creation,
Home Assistant command dispatch, transport readiness, and first advancing
frame. Each failed physical result should have stopped that line of work;
instead, another speculative layer was changed.

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
- The agent treated partial timing records as proof of causes they did not
  measure, then presented each new hypothesis too confidently.
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
- Preserve the restored `cd96f87` implementation unless the user explicitly
  requests another change.
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
