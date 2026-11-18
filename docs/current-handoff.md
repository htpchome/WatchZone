# WatchZone Current Handoff

Use this document to resume work in a new session. Read `AGENTS.md`,
`architecture.md`, `ROADMAP.md`, and the contracts governing the affected
feature before changing source code.

## Repository state

- Branch: `main`
- Application version: `0.0.4-dev.435`
- Baseline commit: `05c4348` —
  `v0.0.4-dev.434 - fix(frontend): restore full-viewport Companion landscape rotation`
- The expected pending dev.435 change adds synchronized two-panel rotation
  choreography and removes the fullscreen grip/alert-outline bleed.
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
  expensive border recomposition. They return after settlement only in the
  collapsed 60/40 layout; fullscreen keeps the outline and grip visual hidden.

## Rotation transition implementation

- Companion's native whole-window transition owns the physical rotation.
- Portrait keeps WatchZone in normal Home Assistant flow below the navigation.
- Landscape retains the portrait flow allocation as an inert placeholder and
  fixes the WatchZone surface over the complete viewport. The HA navigation is
  covered, not removed or restyled.
- Orientation atomically selects the compatible Stage variant. Stage children
  are never individually scaled or reparented. The stable camera and activity
  placement containers form two visual panels and receive mirrored 3D
  rotations around the center gutter with one duration and easing curve.
- On portrait return, the landscape surface remains until viewport dimensions
  are stable. The portrait Stage update and removal of the landscape cover
  complete in one paint, preventing a portrait-on-overlay frame or late header
  push-down.
- Activity-tile and camera alert/detection outline widths remain temporarily
  zero during the orientation transaction and are restored after settlement.

## Rotation status: physical-device verification required

The dev.435 implementation addresses the transition defects visible in the
November 18 recordings:

- the camera no longer receives an independent non-uniform FLIP scale;
- the 60/40 Stage is selected without a delayed full-width landscape frame;
- Home Assistant's navigation is visible in portrait and covered in landscape;
- the portrait flow slot remains allocated while the surface covers the
  landscape viewport, preventing page collapse or scroll loss; and
- fullscreen camera expansion uses the full-viewport surface bounds instead of
  the retained portrait placeholder;
- the fullscreen grip visual and camera activity outline are suppressed while
  expanded, eliminating bleed over the media; and
- the camera and activity panes fold as a synchronized two-panel pair in both
  orientation directions.

Automated browser tests validate ownership, identity, layout, animation
boundaries, and a persistent navigation fixture, but they do not reproduce the
complete iOS WebView rotation. The result must be recorded and verified on a
physical iPhone before this rotation issue is considered closed.

The implementation preserves:

- the stable live camera DOM and retained media session;
- one atomic Stage transition in both directions;
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

## Home Assistant secondary-text compatibility

- `--wzc-color-text-2` is the single frontend bridge for secondary text and
  inactive icon color.
- It resolves `--secondary-text-color` first and uses
  `--ha-color-text-secondary` as the fallback. This preserves older Home
  Assistant themes that define both variables but provide their intended color
  through the legacy token.
- Feature-level semantic aliases such as event metadata, day headings, and
  inactive Stage controls continue to consume `--wzc-*` tokens. Do not add
  feature-specific Home Assistant fallbacks or hard-coded corrections.

## Canonical semantic status palette

- Error is fixed to `#db4437`, warning to `#ffa600`, info to `#039be5`, and
  success to `#43a047` at the centralized WatchZone token boundary.
- Third-party themes cannot override these product semantics. Status fills,
  quiet fills, and borders derive from the same four bases.
- Alert presentation uses error; detection presentation uses warning. Reviewed
  state uses success and unreviewed state uses warning. This includes camera
  and thumbnail outlines, classification badges, review controls, and
  recording-scrubber classifications.
- Information-outline actions and editor help affordances consume the fixed
  info base.

## Validation at dev.433

The dev.433 source passed:

- formatting, lint, TypeScript type checking, and frontend build;
- 488 unit tests across 77 files;
- 156 Playwright tests across Chromium, Firefox, and WebKit;
- browser coverage proving the card remains in flow beneath persistent Home
  Assistant navigation in both orientations;
- browser coverage proving canonical status colors ignore conflicting theme
  values and the legacy secondary-text token wins when both HA variables are
  defined;
- release packaging and version consistency;
- `git diff --check`.

Release budget at that baseline:

- eager graph: 60,584 bytes gzip;
- validation ceiling: 61,440 bytes gzip;
- lazy editor graph: 19,421 bytes gzip.

The eager graph has only 856 bytes of remaining validation headroom. Run
`bash scripts/package-release.sh` before every release-affecting handoff and do
not hand work back over budget.

## Working rules for the next session

- Verify dev.433 repeatedly on a physical iPhone before further rotation tuning.
- If a pop remains, capture a new recording and trace the card's own measured
  flow geometry before changing animation duration or adding a timing delay.
- Do not change unrelated surfaces while correcting the portrait-return pop.
- Preserve user changes and do not use destructive Git commands.
- Do not commit. The user performs commits.
- Bump the prerelease version only when handing release-affecting source work
  back for commit, and synchronize every version-bearing file.
- Always provide the exact proposed commit subject for a handoff.
- Run the complete applicable validation matrix, release-budget validation,
  and `git diff --check` before handing source work back.
