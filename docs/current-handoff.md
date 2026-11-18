# WatchZone Current Handoff

Use this document to resume work in a new session. Read `AGENTS.md`,
`architecture.md`, `ROADMAP.md`, and the contracts governing the affected
feature before changing source code.

## Repository state

- Branch: `main`
- Application version: `0.0.4-dev.431`
- Baseline commit: `c6770b6` —
  `v0.0.4-dev.430 - fix(mobile): synchronize rotation with HA layout settlement`
- The worktree was clean at that baseline. The expected pending dev.431 change
  replaces per-placement rotation FLIP with one coordinated card-surface
  transition and updates its focused tests and this handoff.
- Release artifact: `dist/watchzone.zip`

Documentation-only work does not require a version bump. The user makes all
commits; agents provide a proposed commit subject and must not commit unless
explicitly instructed.

## Current product baseline

### Architecture and Stage layouts

- WatchZone remains one Home Assistant Python integration with a packaged Lit
  frontend.
- Stage layout rendering follows the versioned Stage Design contract.
- Built-in layouts now include `default.json` and `default_mobile.json`.
- A Stage Design can be classified for standard, mobile, or both presentations.
- Physical mobile clients select the mobile default layout.
- Activity navigation is a real independently placeable module. It uses the
  same module implementation in standard and mobile layouts; the mobile
  landscape presentation only places it differently.

### Live camera and media behavior

- Live sessions remain owned by the document-scoped media-session manager.
- Camera elements retain their sessions across Stage layout changes; rotation
  code must not clone, replace, or reparent live media elements.
- Desktop grouped A/B cameras retain their configured side-by-side or stacked
  presentation.
- On phones, both physical members of an A/B group are separate carousel stops
  in portrait and landscape fullscreen. Phone carousel policy is isolated from
  desktop grouped-camera presentation.
- Recorded media, reviews, events, recordings, exports, and their existing
  interaction behavior remain intact.

### Mobile sizing and safe areas

- Companion phone portrait sizing is stable and locks the outer WatchZone view
  to the viewport. Only the internal activity list scrolls.
- Browser-phone and Companion sizing are distinct because Home Assistant's
  Companion shell accounts for layout space differently from a normal mobile
  browser.
- Do not change the existing `100dvh` ownership or formula without a complete
  layout trace and explicit approval.
- The bottom safe-area veil cover was removed from all presentations. The
  activity list still underscrolls the safe area.
- Companion tablets are not part of the current landscape transformation.

## Companion phone landscape presentation

This feature applies only to the Home Assistant Companion app on phones.

- Portrait uses the normal vertical mobile Stage.
- Landscape transforms the Full Stage into a 60/40 presentation:
  - camera and camera navigation on the left;
  - reviews/events/recordings/exports on the right;
  - activity navigation below the camera on the left.
- The camera remains 16:9 and is always rounded in this landscape presentation,
  independent of the editor's camera-corner setting.
- The portrait camera pull-down/resize handle is hidden in landscape.
- Three activity tiles are visible in the landscape viewport.
- Landscape activity tiles use compact reviewed/unreviewed outline icons
  without status text. The AI action and information action share the footer
  line.
- Left and right safe insets and the center gutter are intentionally retained
  so either phone rotation direction is usable.

### Camera expansion handle

- A vertical handle sits in the gutter between the camera and activity pane.
- It is a tall 3px line using the semantic secondary-text color.
- Dragging right expands the existing camera over the activity pane while
  preserving the live element and its controls.
- Releasing before halfway snaps the camera back. Releasing at or beyond
  halfway completes the fullscreen camera overlay.
- Camera/navigation geometry is stabilized during the gesture so touching the
  handle does not shift the lower bars.
- Alert/detection outlines are suppressed during the active resize to avoid
  expensive border recomposition and restored after settlement.

## Rotation transition implementation

- Companion's native whole-window transition owns the physical rotation.
- WatchZone immediately acquires its fixed viewport overlay and atomically
  selects the compatible Stage variant when orientation crosses. Home
  Assistant's header is therefore covered before a delayed settlement window
  can expose a full-width intermediate camera.
- Stage placements are never individually transformed or scaled. One 180ms
  translation-only Web Animation on the stable `ha-card` surface provides the
  short final settle and honors reduced-motion preferences.
- The Home Assistant layout bridge exposes the Sections container as the
  isolated outer-flow anchor. Portrait position is recorded before landscape.
  On return, the landscape overlay remains fixed until viewport dimensions are
  stable and that anchor has returned to its recorded portrait position.
- A bounded 1.5-second safety release prevents a missing or replaced Home
  Assistant anchor from trapping the card in its overlay.
- Activity-tile and camera alert/detection outline widths remain temporarily
  zero during the orientation transaction and are restored after the single
  surface settle.

## Rotation status: physical-device verification required

The dev.431 implementation addresses the transition defects visible in the two
November 18 recordings:

- the camera no longer receives an independent non-uniform FLIP scale;
- the 60/40 Stage is selected without a delayed full-width landscape frame;
- the Home Assistant header is covered as soon as landscape is detected; and
- portrait overlay release is gated by the previously recorded HA flow anchor,
  not by elapsed stability time alone.

Automated browser tests validate ownership, identity, layout, and animation
boundaries, but they do not reproduce Home Assistant Companion's asynchronous
iOS navbar lifecycle. The result must be recorded and verified on a physical
iPhone before this rotation issue is considered closed.

The implementation preserves:

- the stable live camera DOM and retained media session;
- one coordinated surface transition in both directions;
- Companion portrait viewport locking;
- the 60/40 landscape layout and expansion handle;
- phone A/B carousel behavior;
- desktop A/B side-by-side and stacked behavior;
- normal mobile-browser behavior;
- tablet and desktop layouts;
- current `100dvh` sizing ownership.

### Required real-device checks

Browser automation remains required, but it is not sufficient for this issue.
Verify repeatedly on an iPhone in Companion:

- portrait to landscape and landscape to portrait;
- both clockwise and counter-clockwise rotation;
- edge-to-edge enabled;
- a normal camera and an alert/detection-outlined camera;
- an A/B grouped camera entered from A, from B, and from an unrelated camera;
- camera expansion to fullscreen and return;
- no outer-window scroll and no lower-bar layout shift.

## Validation at dev.431

The dev.431 source passed:

- formatting, lint, TypeScript type checking, and frontend build;
- 489 unit tests across 77 files;
- 156 Playwright tests across Chromium, Firefox, and WebKit;
- release packaging and version consistency;
- `git diff --check`.

Release budget at that baseline:

- eager graph: 60,638 bytes gzip;
- validation ceiling: 61,440 bytes gzip;
- lazy editor graph: 19,414 bytes gzip.

The eager graph has only 802 bytes of remaining validation headroom. Run
`bash scripts/package-release.sh` before every release-affecting handoff and do
not hand work back over budget.

## Working rules for the next session

- Verify dev.431 repeatedly on a physical iPhone before further rotation tuning.
- If a pop remains, capture a new recording and trace the Home Assistant flow
  anchor before changing animation duration or adding another timing delay.
- Do not change unrelated surfaces while correcting the portrait-return pop.
- Preserve user changes and do not use destructive Git commands.
- Do not commit. The user performs commits.
- Bump the prerelease version only when handing release-affecting source work
  back for commit, and synchronize every version-bearing file.
- Always provide the exact proposed commit subject for a handoff.
- Run the complete applicable validation matrix, release-budget validation,
  and `git diff --check` before handing source work back.
