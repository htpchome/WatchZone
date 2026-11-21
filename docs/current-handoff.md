# Current Development Handoff

This is a replaceable working snapshot, not an architectural contract.
`AGENTS.md`, `architecture.md`, `ROADMAP.md`, and the governing contracts in
`docs/` take precedence.

## Start here

Work in `/workspaces/WatchZone`. Read the required contracts, then verify
`git status`, `git log -1`, and `custom_components/camera_optics/const.py`.
Preserve unrelated changes. The user owns commits and repository sync.

## Current state

- Branch: `main`.
- HEAD: `2e7c5df` —
  `v0.0.5-dev.4 - revert(camera): restore v0.0.4 behavior`.
- Application version: `0.0.5-dev.4`.
- Home Assistant config-entry schema: **2**.
- The working tree was clean before this handoff-only edit.
- The source is back on the tagged `v0.0.4` behavior. The failed managed
  substream backend and the attempted backend-failure screen are not present.

## Critical failure: backend substream experiment and rollback

The managed-substream work caused a serious and avoidable development failure:

1. `v0.0.5-dev.1` explicitly changed `CameraOpticsConfigFlow.VERSION` from 2
   to 3 while adding experimental Home Assistant substream and external go2rtc
   subentries and managed camera entities.
2. Home Assistant did **not** infer or initiate this schema change. CameraOptics
   code declared it. The 2-to-3 migration transformed no existing data; it only
   wrote schema 3. The bump was unnecessary.
3. `v0.0.5-dev.3` abandoned that backend design, deleted the experimental
   subentries, and explicitly changed the schema from 3 to 4 to trigger cleanup.
   This compounded the first mistake.
4. Home Assistant refuses to load an entry whose stored major schema is higher
   than the installed integration's declared schema before the integration's
   migration function can run. Returning directly to schema-2 code therefore
   produced a migration error and prevented CameraOptics from loading.
5. The agent initially and falsely attributed the schema upgrade to Home
   Assistant, obscuring that CameraOptics code had explicitly raised it. The
   agent also incorrectly presented deletion/recreation as the only recovery.
   A temporary schema-4 downgrade bridge could have removed experimental data,
   called Home Assistant's supported entry update API to restore schema 2, and
   then allowed the older integration to load.
6. The user ultimately removed and reinstalled CameraOptics, restoring a clean
   schema-2 entry and `v0.0.4` behavior.

### Schema rule

- Keep `CameraOpticsConfigFlow.VERSION` at **2**. Current and planned backend
  work does not require a schema bump.
- Home Assistant schema and CameraOptics application SemVer are independent.
  Application prerelease increments never require schema increments.
- Never raise the major schema to mark feature development, add or remove an
  optional flow, or trigger cleanup of experimental data.
- A schema change requires a real persisted-data transformation, explicit user
  approval, upgrade coverage, and a tested downgrade/rollback bridge before it
  is implemented. Use `MINOR_VERSION` only when Home Assistant's compatibility
  contract fits the change.
- Experimental backend work must remain removable without making the previous
  release unloadable.

## Critical failure: no safe frontend backend-failure boundary

When the Python integration failed to load, the card did not enter one inert
application-level failure state. Instead:

- a camera poster remained visible and looked partially functional even though
  live CameraOptics services were unavailable;
- Reviews rendered the successful empty-state message despite its request
  failing;
- repeated review-error toasts and reconnect behavior accumulated;
- the uncontrolled failure/retry behavior froze multiple browser sessions; and
- the UI did not clearly state that the mandatory CameraOptics integration had
  failed or direct the user to Devices & services and Home Assistant logs.

This remains unresolved in the current source. CameraOptics has no supported
frontend-only live mode, but that does not excuse unsafe or misleading failure
behavior. A future fix must:

- perform one lightweight backend-availability check before Stage features
  start;
- issue no camera, review, event, or media work while the backend is unavailable;
- replace the complete card with one localized, inert error state;
- display the useful Home Assistant error reason when available;
- explain that live video and CameraOptics features require the integration;
- direct the user to Devices & services and Home Assistant logs;
- avoid stale posters, false empty states, repeated toasts, and automatic retry
  loops; and
- retry only through explicit user action or a deliberately bounded recovery
  policy.

## Failure while attempting the failure boundary

An attempted implementation added a backend health command, frontend health
check, card gate, error UI, localization, and tests. Its handling also failed:

- The agent left six unfinished source/test files mixed with the handoff edit
  and then supplied a documentation commit subject without disclosing that the
  complete commit queue was not ready.
- At that point only Prettier had run. Ruff was unavailable through the first
  command used; focused tests, backend tests, build, and browser tests had not
  been completed.
- When asked what the queued changes were and whether they were finished, the
  agent treated the questions as authorization to remove them. The user had not
  requested removal. The agent then restored them after correction.
- The first focused frontend run failed: 15 tests passed and one existing Home
  Assistant restart test failed because the new health check called `.then()`
  on an invalid undefined WebSocket mock response.
- The mock was corrected and the focused card suite then passed 16/16. A direct
  backend health-command test was added, but backend validation was interrupted
  before completion.
- The user discarded all of these source changes. None of the attempted
  failure-boundary implementation remains and none of it is commit-ready.

Do not reconstruct or restore that discarded patch blindly. Reimplement the
requirement deliberately from the current clean baseline, with tests designed
before the commit is presented.

## Stable product and behavior baseline

- Product/display name: `CameraOptics`; domain and Python/WebSocket/HTTP
  namespace: `camera_optics`.
- Lovelace type: `custom:camera-optics-card`; frontend entry:
  `camera-optics.js`; HACS artifact: `camera-optics.zip`.
- The development repository remains `htpchome/WatchZone`; stable internal
  `wzc` identifiers remain unchanged.
- TWT persistence is document-scoped application behavior, not a Stage module,
  component, placeable, or configurable Stage item.
- Camera and persistent-tile TWT placements use the same standard controls;
  only the camera overlay uses the alternate overlay presentation.
- A connected TWT call follows camera and Home Assistant dashboard navigation.
  The active camera uses normal controls; elsewhere one bottom-centered global
  tile appears. Close ends and dismisses it. Ending talk from its microphone
  keeps a local restart launcher only until the next navigation/camera change.
- Incoming audio stays on the separate live-camera WebRTC peer; the talk peer
  remains send-only. Talk starts with incoming audio unmuted, and every exit
  restores the camera to muted.
- Document-scoped media sessions own retained WebRTC, MSE, and HLS transports.
  Element disconnection releases a lease rather than directly closing healthy
  retained media.

## Validation truth

- The rollback build passed formatting, lint, typecheck, production build,
  version synchronization, 539 frontend unit tests, Ruff, and mypy.
- Backend pytest produced 119 passes and two unrelated stale-fixture failures.
- The later full browser matrix did **not** pass: its Vite server stopped during
  execution. Forty-nine tests passed before subsequent tests received
  connection-refused errors. Do not report 174/174 for this rollback.
- The discarded failure-boundary patch had only the focused 16/16 frontend card
  result after its test correction. It did not complete backend, build, or
  browser validation.

## Working and handoff rules

- Treat a question about files, status, or testing as a request for information,
  not authorization to edit, restore, discard, stage, or commit.
- Never leave unfinished source changes unexplained in a commit queue.
- Before providing a commit subject, inspect the complete working tree and
  report every included file plus exact validation results. Do not provide a
  subject while any included source work is unfinished or failing.
- A documentation-only subject is allowed only when documentation is the only
  working-tree change or the exact path-limited commit is explicitly stated.
- Follow the user's literal request; adjacent analysis does not authorize a
  redesign, schema change, or destructive cleanup.
- Treat screenshots and recordings as evidence. Automated tests do not
  overrule visible behavior.
- Never claim success without validation evidence.
- Never commit. The user owns commits.
