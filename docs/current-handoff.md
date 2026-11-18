# WatchZone Current Handoff

Use this document to resume work in a new session. Read `AGENTS.md`,
`architecture.md`, `ROADMAP.md`, and the contracts governing the affected
feature before changing source code.

## Repository state

- Branch: `main`
- Application version: `0.0.4-dev.430`
- Baseline commit: `c6770b6` —
  `v0.0.4-dev.430 - fix(mobile): synchronize rotation with HA layout settlement`
- The worktree was clean at that baseline. The only expected pending change
  after this handoff update is `docs/current-handoff.md`.
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

- Rotation uses FLIP with the Web Animations API (`Element.animate()`) on the
  stable Stage placements.
- Both portrait-to-landscape and landscape-to-portrait transitions use the same
  FLIP lifecycle.
- The current duration is 360ms. Reduced-motion preferences are honored.
- The transition controller observes viewport dimensions and the top position
  of the outer parent layout. It currently waits for 180ms of stable geometry
  before committing the responsive reflow.
- Activity-tile and camera alert/detection outline widths are temporarily zero
  during the orientation FLIP and restored after settled geometry. This avoids
  outlines visibly trailing their animated surfaces.
- Do not restore the dev.429 approach of a longer 400ms animation plus extra
  settlement frames. It made the motion jerky and bouncy and did not solve the
  outline issue.

## Active issue: camera still pops on rotation

The rotation work is not complete.

On a real iPhone in Companion, returning from landscape to portrait still
shows the camera at the top of the screen before it abruptly moves down below
Home Assistant's restored top navigation bar. Entering landscape can also show
a smaller bounce while that navbar is being removed.

The relevant behavior is:

1. Home Assistant's top navbar is visible in portrait.
2. Home Assistant removes it asynchronously for the landscape presentation.
3. Home Assistant restores it asynchronously when returning to portrait.
4. WatchZone sometimes captures or presents its FLIP destination before that
   outer Home Assistant layout has reached its final normal-flow position.
5. Home Assistant then inserts the header space and pushes the card down,
   producing the visible pop after WatchZone's transition.

Commit dev.430 added parent-top tracking and a 180ms stability window, but the
real-device recording shows that this is not a sufficient synchronization
signal. Synthetic browser tests pass because they do not reproduce Home
Assistant's actual asynchronous navbar lifecycle.

### Required next work

Perform a full layout trace before changing animation values or adding delays.
The trace must identify the actual sequence for:

- orientation and visual-viewport changes;
- Home Assistant navbar removal/restoration;
- the card's outer normal-flow anchor moving;
- WatchZone changing Stage mode;
- First and Last FLIP rectangle capture;
- animation completion and final style cleanup.

The fix should make the controller wait for a reliable Home Assistant-owned
outer-layout signal or stable normal-flow anchor before capturing the final
portrait rectangle. The landscape card itself is fixed-positioned, so its own
host rectangle is not, by itself, a reliable signal for restored portrait
placement.

Prefer a narrow Home Assistant layout bridge or an existing stable parent
anchor over guessed pixel constants, longer animation durations, or repeated
`requestAnimationFrame` settlement loops. Keep Home Assistant DOM knowledge
isolated at the existing HA boundary rather than spreading shell selectors into
the Stage controller.

The result must preserve:

- the stable live camera DOM and retained media session;
- the same FLIP transition in both directions;
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

## Validation at dev.430

The dev.430 source passed:

- formatting, lint, TypeScript type checking, and frontend build;
- 488 unit tests across 77 files;
- 156 Playwright tests across Chromium, Firefox, and WebKit;
- release packaging and version consistency;
- `git diff --check`.

Release budget at that baseline:

- eager graph: 60,612 bytes gzip;
- validation ceiling: 61,440 bytes gzip;
- lazy editor graph: 19,421 bytes gzip.

The eager graph has only 828 bytes of remaining validation headroom. Run
`bash scripts/package-release.sh` before every release-affecting handoff and do
not hand work back over budget.

## Working rules for the next session

- Trace the complete layout lifecycle before editing rotation code.
- Do not change unrelated surfaces while correcting the portrait-return pop.
- Preserve user changes and do not use destructive Git commands.
- Do not commit. The user performs commits.
- Bump the prerelease version only when handing release-affecting source work
  back for commit, and synchronize every version-bearing file.
- Always provide the exact proposed commit subject for a handoff.
- Run the complete applicable validation matrix, release-budget validation,
  and `git diff --check` before handing source work back.
