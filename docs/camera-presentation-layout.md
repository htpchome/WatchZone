# Camera Presentation Layout

This document defines the sizing contract between the Home Assistant card,
camera module, and live presentation. It supplements `architecture.md`; that
document remains authoritative for application-wide boundaries.

## Ownership

- Home Assistant owns the card's allocated grid rectangle.
- The card shell owns the accessible card name, outer padding, and the stage
  containing the active layout's modules. It does not render a visual heading.
- The camera module owns the camera stage, including its clipping radius and
  stage shadow. Appearance is applied to that stable module boundary, not to an
  individual carousel slide.
- The live presentation fills the camera stage. It does not determine card or
  dashboard dimensions from media metadata, and it does not own the module
  shadow. Its clipping radius inherits the module's stage radius.
- Media elements own only how their intrinsic content fits inside the stage.
- An additional-camera pair is private Camera-module composition. Its two live
  presentations keep independent provider, session, zoom, and pan identity;
  it is not another Stage module or component.

## Default sizing

The card advertises Home Assistant's `full` width and explicit automatic row
sizing in sections view. Home Assistant does not expose an automatic-width
grid value; `full` makes a new card consume its entire available section row,
including a section that spans multiple columns. Content determines the
default height. The camera stage reserves `--wzc-camera-stage-aspect-ratio`,
which defaults to `16 / 9`. Outer padding is outside that ratio.

The lazy-loading placeholder reserves the same stage ratio and background as
the loaded camera module. Loading the camera code, fallback image, HLS, or
WebRTC must not change the card's geometry.

## Explicit Home Assistant height

If the user disables automatic height and assigns grid rows, that rectangle is
an explicit layout constraint. The card and camera stage fill the available
content track rather than overflow or preserve a competing minimum height. The
stage may therefore be a ratio other than `16 / 9` in an explicitly resized
card.

This is intentional: `16 / 9` is the natural default, not a constraint that is
allowed to clip content or escape Home Assistant's allocated grid area.

## Media fitting

- All fallback images and live video use `object-fit: contain` by default.
- A `16:9` source fills the default stage.
- A `4:3` source is pillarboxed inside the default stage.
- Source metadata and first-frame events never resize the stage.
- Grouped feeds use the configured side-by-side or stacked split at tablet and
  desktop widths. At phone-width camera containers, only one member is
  presented and the overlay selector toggles A/B. The responsive change does
  not rewrite the saved group layout.
- The split is always contained inside the same camera-stage rectangle used by
  a standalone camera. Child feeds never contribute intrinsic height to the
  carousel, so configuring a group cannot resize that group, another slide, or
  the surrounding card on first paint.
- The runtime stage-height handle may expand the stage from its `16:9` default
  to a guarded maximum of `1:1`. It is transient presentation state, keyed by
  the camera-module instance, and does not alter YAML or provider state. Every
  carousel slide receives the same height ratio, so changing cameras preserves
  stage geometry while each camera retains its independent media dimensions,
  zoom, and pan.
- The resize handle is positioned against the card-local camera stage. Mobile
  viewport safe-area insets do not offset it because the stage is not a
  viewport-edge surface; fullscreen controls own safe-area treatment instead.
- A grouped stage has one resize handle and one shared stage-height ratio. Each
  member independently derives media fit and pan bounds inside its own half (or
  its phone-width solo viewport).
- Until the expanded stage reaches the active media's intrinsic ratio, media
  remains contained so sources such as `4:3` reveal their available height.
  Expansion beyond the source ratio increases a centered base presentation
  scale to the equivalent of `cover`, intentionally cropping the source rather
  than adding new letterboxing. Because the existing zoom controller owns that
  transform and its bounds, the cropped axis is pannable immediately without
  requiring user zoom first.
- Home Assistant's explicit grid height remains authoritative. Runtime stage
  resizing may not escape or overflow an explicitly allocated card rectangle.

## Interactive stage resizing

The camera module owns the canonical runtime height ratio. The active camera
view's `CameraStageResizeController` owns pointer capture, keyboard slider
behavior, fit threshold, and cleanup, then emits typed size intent to the
camera parent. The parent applies that ratio to its viewport and every stable
carousel slide; the views do not create per-camera stage-height state. Dragging
down increases height; dragging up reduces it. Arrow keys, Home, and End
provide keyboard access, and double-click/double-tap resets the stage. The
resize handle owns only its own touch gesture and does not replace native page
scrolling elsewhere.

- The resize handle keeps a larger transparent interaction target than its
  visible pill. The handle and the bottom control dock use shared stage-local
  geometry so presentation changes move light, talk, and PTZ controls together.

Stage sizing is separate from user display zoom. Resizing changes the viewport
and reports only the base presentation scale required to fill it. The
`MediaZoomController` remains the sole transform and pan-bound owner and
combines that base scale with the independent `1x` to `3x` user zoom. It derives
bounds from the active media ratio, so letterbox space cannot be dragged into
view. When an expanded stage is dragged upward, the stage controller reports
normalized return progress to the camera parent. The parent coordinates that
intent with the live presentation, which continuously returns user zoom and pan
toward `1x` centered media while the base scale independently follows stage
geometry. Reversing or partially releasing the drag preserves the most-neutral
transform already reached; pulling down again resizes the stage without
resurrecting discarded user zoom or pan. A drag that starts at the default
height uses its greatest expansion as the return range. Controls, source state,
and toasts remain outside both transformations.

## Performance and stability

- Default layout uses CSS sizing and intrinsic aspect ratio. JavaScript changes
  the CSS ratio only during an explicit user resize gesture; it does not derive
  card geometry from connection or media lifecycle events.
- Space is reserved before the lazy camera module or media loads, preventing
  source selection and fallback replacement from producing layout shifts.
- The authenticated fallback image remains eligible to paint before live media
  and occupies the final media box.
- Size changes are not animated. User-driven Home Assistant resizing may
  reflow, but connection, poster, and transport changes may not.
- Stage-created crop, pan, and stage-return zoom coordination change only the
  media's compositor transform during direct user interaction. They do not
  animate stage geometry, schedule a post-release correction, or alter the
  reserved default ratio, preventing avoidable layout shifts outside the
  user's resize action.

## Live overlay zones

The live stage uses fixed presentation zones. Controls are assigned to a zone;
they must not derive their position from the number of controls in another
zone.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ [group A/B]        [slideshow] [camera picker]        [source badge]│
│                                                                      │
│ left lane │  ‹       unobstructed live media        ›  │ right lane │
│           │                                           │ player tools│
│           │                                           │ power / PiP │
│           │                                           │ snapshot    │
│           │                                           │ fullscreen  │
│           │                                           │ mute        │
│                                                                      │
│                     [light] [talk]                    [PTZ]          │
│ camera name                 [resize handle]              timestamp   │
└──────────────────────────────────────────────────────────────────────┘
```

- Group A/B controls are square shared media-overlay controls owned by the
  fixed left rail and begin at its top inset. They stack within that rail; they
  are never positioned from a percentage of the Stage width. Camera selection
  is the immutable top-center anchor: its center always equals the Stage
  centerline and no sibling control may participate in or alter that
  calculation. Slideshow sits immediately before that anchored picker. Source
  state owns
  top-trailing. Every top-row control uses
  the shared media-overlay control sizing contract; text controls may be wider,
  but their height, border, radius, and vertical alignment are uniform. Compact
  container reductions are defined once in `overlay-control.styles.ts` and are
  not repeated by individual controls.
- The outer side lanes are reserved. Carousel arrows sit inside the live-media
  boundary, immediately after the left lane and immediately before the right
  lane; they never occupy either lane. The shared boundary is
  `--wzc-camera-side-lane-inline-size`; carousel navigation, the top overlay
  row, and the lower control band all derive from that boundary.
- The fixed right lane owns the vertical player-tool dock. Adding or removing a
  player tool does not move either carousel arrow horizontally. Expanded PTZ is
  the deliberate lower-band exception: its anchor and collapsed trigger remain
  inside the lower-trailing zone, while its expanded edge crosses into the
  right lane only by `--wzc-ptz-right-rail-overlap`, as drawn. It remains
  vertically separate from the player-tool dock.
- Each feed in an additional-camera group retains its own source badge because
  A and B may resolve different transports. A grouped feed badge follows the
  trailing edge of that feed's fitted media instead of the Stage edge, so a
  stacked feed cannot place its badge in the player-tool rail.
- Light and talk occupy the lower center band. PTZ occupies the lower trailing
  band. The resize handle owns the bottom center edge. Camera name and timestamp
  remain unobstructed in the bottom metadata strip.
- Module-private overlays and Stage components follow the same zone geometry;
  they do not create competing offsets or duplicate touch visibility owners.

## Verification

Browser coverage must verify automatic `16:9` stage sizing, explicit-height
containment without overflow, `4:3` media containment, immediate pan after a
stage-created crop, placeholder geometry, and consistent behavior in Chromium,
Firefox, and WebKit.
