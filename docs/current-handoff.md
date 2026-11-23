# Current Development Handoff

This is a replaceable working snapshot, not an architectural contract.
`AGENTS.md`, `architecture.md`, `ROADMAP.md`, and governing documents take
precedence.

## Current state

- Branch: `main`.
- HEAD before the current uncommitted change: `1736851`
  (`v0.0.5-dev.27`).
- Application version: `0.0.5-dev.29`.
- Home Assistant config-entry schema: **2**.
- The implementation has been restored to commit `cd96f87`, the last state
  before the `dev.23` through `dev.25` browser-compatibility changes.
- `dev.26` is the release identity for that restored implementation; history
  was not rewritten and no commit was created by the agent.
- The restored release was rebuilt and packaged successfully with a
  61,420-byte eager graph, 20 bytes below the 61,440-byte release limit.
- `dev.17` through `dev.22` did not solve the reported background recovery
  failure and must not be treated as successful work.

## Current HLS foreground-resume correction

`dev.29` addresses the presentation gate demonstrated by physical `dev.28`
timings. Frigate HLS began and selected in 183.3 ms, but its attempt did not
start until the retained WebRTC presentation had already consumed the visible
delay. A WebRTC player that decoded before the document was hidden retained its
old usability proof, remained selected on return, and suppressed fallback
acquisition until the peer declared failure. This affected both Home Assistant
Direct and Frigate go2rtc HLS.

After the document remains hidden beyond the shared two-minute active-media
window, CameraOptics now retains the WebRTC peer but invalidates only its old
presentation proof. It starts the configured fallback immediately and asks the
retained player to prove a fresh decoded frame. HLS may therefore paint in its
measured sub-second time; WebRTC takes presentation back only if it produces a
new frame. Frigate MSE previously avoided the long delay by keeping its losing
fallback session parked after WebRTC takeover. That behavior kept a second
go2rtc WebSocket consumer alive and could continue receiving media payload only
to discard it in the browser. `dev.29` removes that standby connection: losing
MSE and HLS fallbacks are both closed after WebRTC takeover, and either fallback
is reacquired immediately by the same foreground hedge when needed.
The fresh `dev.29` release package validates with a 61,436-byte eager graph,
four bytes below the repository's 61,440-byte limit.

`dev.28` did not improve the reported physical behavior. Its foreground retry
separation remains as protection for the distinct case where multiple expired
actively leased transports restart together, but it was not the missing
presentation-level correction.

`dev.28` corrects a shared foreground-recovery ordering defect affecting both
Home Assistant HLS and Frigate go2rtc HLS. After the two-minute hidden-window
teardown, the session manager placed the expired HLS transport and an
unavailable WebRTC candidate into the same serialized provider-retry queue.
Because WebRTC was acquired first, its adapter timeout could prevent HLS from
starting for approximately 15 seconds even though the HLS pipeline itself was
fast and the backend stream was warm.

Foreground lifecycle replacement now restarts each actively leased transport
independently, matching fresh hedged startup. Healthy retained WebRTC remains
untouched, HLS is no longer gated by a failed or pending WebRTC attempt, and
ordinary provider-outage retries across cameras remain serialized. The same
rule applies when retained HLS fails its foreground advancing-frame validation.
Regression coverage exercises both Home Assistant and Frigate go2rtc session
keys with a WebRTC candidate that remains pending while HLS reconnects.
The fresh `dev.28` release package validates with a 61,432-byte eager graph,
eight bytes below the repository's 61,440-byte limit.

Physical Firefox diagnostics proved that Frigate HLS itself acquired its URL
in 16.7 ms, loaded its manifest in 66.7 ms, and decoded and selected its first
frame in 266.7 ms. The remaining delay was therefore not HLS source
acquisition. The retained-session path kept actively leased HLS alive for two
hidden minutes but did not invoke its adapter resume and advancing-frame
validation when the document became visible inside that window. Chromium could
suspend that retained player and leave it to recover on its own.

`dev.27` resumes and validates actively leased HLS.js and native-HLS players on
foreground return. A player that advances remains the same retained session; a
player that fails the bounded validation is closed and replaced through the
ordinary fresh connection path. The existing two-minute full teardown remains
unchanged, as do MSE and WebRTC visibility behavior.

The fresh `dev.27` production build validates with a 61,437-byte eager graph,
three bytes below the repository's 61,440-byte validation limit.

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
