# Camera Presentation Layout

This document defines the sizing contract between the Home Assistant card,
camera module, and live presentation. It supplements `architecture.md`; that
document remains authoritative for application-wide boundaries.

The lightweight `minimal_camera` module is a separate Stage placeable. It owns
one physical camera presentation, including the primary camera of an A/B pair,
and does not load the Camera module's carousel, zoom/pan, resize, slideshow, or
capability controls. It shares only the document-scoped live-session and audio
controllers. Its independently configurable controls are mute, fullscreen, and
picture-in-picture. A separate camera action surface owns configured Home
Assistant tap, hold, and double-tap actions, so those gestures never compete
with the media controls.

Its live dialog is an independent inline-size container. Shared overlay
controls inside that dialog derive their responsive size from the dialog rather
than inheriting compact control geometry from the Stage placement that opened
it. Moving the retained player from a small tile into a large dialog therefore
restores full touch targets without changing the inline tile's compact controls.
The minimal-camera mute control remains one stable overlay control: muted state
is circular, while unmuting smoothly expands that same control into a pill with
a volume slider. It collapses without replacing the button or changing the
retained session, and respects reduced-motion preference.

## Ownership

- Home Assistant owns the card's allocated grid rectangle.
- The card shell owns the accessible card name, outer padding, and the stage
  containing the active layout's modules. It does not render a visual heading.
- The isolated Home Assistant layout bridge may remove the Sections wrapper's
  outer padding when the user enables edge-to-edge presentation on a physical
  phone. It shares ownership across cards in the same view, restores prior
  inline declarations after the last owner releases them, and does not change
  internal row or column gaps, maximum view width, or grid allocation.
- On a physical phone, edge-to-edge `fit_viewport` presentation extends through
  the complete device bottom safe-area inset. Media lists scroll beneath that
  area without a WatchZone-drawn cover surface, while the complete hardware
  inset remains reserved as trailing scroll padding so the final tile is not
  stranded beneath the home indicator. Home Assistant's reported
  `--safe-area-inset-bottom` is authoritative, with the browser environment
  inset as fallback. WatchZone does not reduce the hardware inset itself or
  apply it to ordinary card-contained surfaces. In Companion, the card uses an
  equal trailing layout overlap without adding that inset to the card viewport
  height. Home Assistant's own safe-area spacing therefore does not create
  outer-window scrolling; only the media viewport moves beneath the safe area.
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

Home Assistant Panel view provides a definite viewport-height allocation even
when the user has not explicitly resized the card. WatchZone uses intrinsic
height in that view so its camera stage retains the natural ratio and the page
can scroll through later modules. This does not override explicit grid-row
height assigned in Sections view.

The lazy-loading placeholder reserves the same stage ratio and background as
the loaded camera module. Loading the camera code, fallback image, HLS, or
WebRTC must not change the card's geometry.

## Card height modes

Card configuration stores independent mobile and standard height modes. The
mobile height mode applies to physical phones and to tablets hosted by Home
Assistant Companion, because Companion owns the same fixed-window viewport
contract on both device classes. Companion tablets retain standard Stage,
appearance, padding, and edge-to-edge behavior. Browser tablets use the
standard height mode, and narrowing a desktop browser does not select the
mobile setting. Each setting accepts the same three values:

- `auto` leaves the card at its natural content height. Scrollable media
  modules retain a three-item minimum and five-item natural-height ceiling.
- `fit_viewport` targets the remaining visible dynamic viewport below the
  card's actual position in Home Assistant. The calculation includes layout
  space above the card and trailing wrapper/container spacing, so the card
  alone does not create main-view scrolling merely because it is offset from
  the header.
- `fill_container` fills a definite height supplied by the parent layout and
  otherwise behaves like automatic percentage sizing.

The current Camera Only and Minimal Camera Stage designs contain no flexible
media row, so they retain natural height regardless of the selected mode. A
Full Stage declares camera and navigation rows as content-sized and its media
stack as the flexible row. Under either constrained mode, the flexible row
receives remaining height and its internal viewport scrolls. Its five-item
ceiling is removed, but its three-item minimum remains.

When a viewport or parent allocation cannot contain the Stage's minimum usable
height, the card grows beyond the requested target. The containing Home
Assistant view or custom layout must then scroll; WatchZone does not shrink the
camera or make the media region unusable. Module minimums derive from current
CSS geometry, so supported theme or user changes to tile sizing also change the
minimum without a parallel pixel constant.

The built-in mobile Full Stage uses a separate Companion-phone landscape
presentation. Portrait remains in the normal Home Assistant flow beneath its
navigation. Landscape retains that flow allocation as a placeholder while the
WatchZone surface covers the complete viewport, including Home Assistant's
navigation; WatchZone does not remove or restyle the navigation itself. The
leading 60% contains a 16:9 camera plus camera navigation; the trailing 40%
contains the active Reviews, Events, Recordings, or Exports stack. The
independently placeable activity-navigation module is right-aligned below the
camera column at its normal toolbar control size. The activity title aligns
with the top of the camera. An expanded module gutter separates the columns,
and a reduced form of the larger reported landscape safe-area inset is
reserved symmetrically on both inline edges so either phone rotation direction
protects both columns.
Each active media list is capped at three complete tiles and remains the only
scrolling surface. Review-state controls use a compact outlined icon without
label text in this presentation, aligned on the tile footer with the
AI-analysis and information controls. The camera uses rounded corners and
hides its resize handle, independent of the ordinary phone Camera appearance
setting. This presentation does not activate for browser phones, Companion
tablets, or incompatible Stage types.

A separate vertical pull handle is centered in the actual gutter at the
Camera's trailing edge in this presentation. Its borderless three-pixel line
uses the semantic secondary text color and keeps a tall visual indicator inside
a larger transparent touch target. The handle remains hidden until the
controller has stable Camera and activity geometry, so an unmeasured handle is
never painted at a default viewport edge. The handle belongs to the fixed card
surface and all of its positions are card-local; WebView viewport transforms
therefore cannot move it between first paint and pointer contact. Camera alert
and detection state remains active during a pull, but its inner activity
outline is suppressed while the Camera is resizing and restored after settling
so the border is not re-rasterized on every drag frame.
Horizontal pointer capture maps the handle's travel directly to a
camera-overlay progress value while preserving the mounted Camera module,
retained live session, and both navigation-row positions. The Camera grows
above the unchanged activity column on one opaque, clipped paint surface;
activity selection and scroll position do not move into the overlay.
Releasing before 50% returns to the 60/40 layout, while releasing at or beyond
50% settles into a viewport-covering Camera with its complete composed control
surface. The viewport-covering carousel, camera shell, and live viewport all
use zero corner radius so the underlying Stage cannot show through. At full
expansion, the grip visual and camera alert/detection outline
do not share presentation: the outline is hidden so it cannot bleed over the
media, while the grip remains visible inside the safe trailing edge and can be
dragged left to restore the split layout. Arrow keys, Home/End, Enter/Space,
and Escape expose the same two states, and reduced-motion preference removes
the settle transition.

Card, Camera, camera-navigation, and activity-tile appearance likewise store
independent standard-device and physical-phone values. Phone defaults use an
edge-to-edge card without card or Camera padding, shadows, or rounded corners;
standard-device defaults retain those surfaces. Physical client identity, not
card width or Stage responsive variant, selects the appearance values.

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
- Overlay controls and the live-media viewport do not contribute an intrinsic
  minimum height to the natural camera stage. At extremely narrow card widths,
  the stage ratio therefore remains authoritative without an additional
  responsive breakpoint.
- Grouped feeds use the configured side-by-side or stacked split on physical
  tablets and desktops. On a physical phone, each member owns a separate
  carousel slide while camera navigation retains one grouped A/B option. The
  selector and ordinary swiping both move between those physical slides, and
  only the selected member connects. Rotation, Stage layout, and the Companion
  landscape Camera pull cannot switch a phone group into combined mode. The
  presentation rule does not rewrite the saved group layout.
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
  its physical-phone solo viewport).
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

The live stage uses exactly six fixed presentation areas: `top`, `left`,
`media`, `right`, `lower`, and `metadata`. Controls are assigned to one area;
they must not derive their position from the number of controls in another
area. No parallel three-by-three overlay, separate controls grid, or corrective
absolute-offset system may coexist with this grid.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ LEFT      │ TOP: [slideshow] [camera picker]           │ RIGHT        │
│ [A audio] ├────────────────────────────────────────────┤ source badge │
│ [A view]  │ MEDIA                                      │ power / PiP  │
│ [B audio] │  ‹          unobstructed video          ›  │ snapshot     │
│ [B view]  │                                            │ fullscreen   │
│           ├────────────────────────────────────────────┤ mute         │
│           │ LOWER: [light] [talk]              [PTZ]  │              │
├───────────┴────────────────────────────────────────────┴──────────────┤
│ METADATA: camera name       [resize handle]        timestamp       │
└──────────────────────────────────────────────────────────────────────┘
```

- Group A/B controls are square shared media-overlay controls owned by the
  fixed left rail and begin at its top inset. They stack within that rail; they
  are never positioned from a percentage of the Stage width. Camera selection
  is the immutable top-center anchor: its center always equals the Stage
  centerline and no sibling control may participate in or alter that
  calculation. On phone containers the picker keeps a useful text width rather
  than collapsing to control-icon dimensions. Slideshow sits immediately
  before that anchored picker. Its
  idle state is square and its countdown/hold state uses one stable wider
  width; a two-digit to one-digit countdown never changes its geometry. Source
  state owns the top of the right rail. Every top-row control uses
  the shared media-overlay control sizing contract; text controls may be wider,
  but their height, border, radius, and vertical alignment are uniform. Compact
  container reductions are defined once in `overlay-control.styles.ts` and are
  not repeated by individual controls.
- The outer side lanes are reserved. Carousel arrows sit inside the live-media
  boundary, immediately after the left lane and immediately before the right
  lane; they never occupy either lane. The shared boundary is
  `--wzc-camera-side-lane-inline-size`; carousel navigation, the top overlay
  row, and the lower control band all derive from that boundary.
- Both side rails extend from the Stage's top edge through the lower band. Rail
  width, top-row height, lower-row height, gaps, and every overlay control size
  derive from the same Stage-owned responsive token system, so a short
  phone stage cannot retain desktop rail geometry.
- The fixed right lane owns the vertical player-tool dock. Adding or removing a
  player tool does not move either carousel arrow horizontally. PTZ belongs
  wholly to the trailing edge of `lower`; its collapsed trigger, immutable
  expansion center, and expanded panel never enter the right rail or metadata
  strip. It remains vertically separate from the player-tool dock. The
  collapsed trigger follows the shared responsive button size, but the expanded
  directional panel retains its full precision-control geometry at phone,
  tablet, and desktop sizes.
- Each feed in an additional-camera group retains its own source badge because
  A and B may resolve different transports. A grouped feed badge follows the
  trailing edge of that feed's fitted media instead of the Stage edge, so a
  stacked feed cannot place its badge in the player-tool rail.
- Light and talk occupy the lower center band. PTZ occupies the lower trailing
  band. These precision and communication controls retain their full target
  size at phone, tablet, and desktop widths. The resize handle owns the bottom
  center edge. Camera name and timestamp remain unobstructed in the bottom
  metadata strip.
- Module-private overlays and Stage components follow the same zone geometry;
  they do not create competing offsets or duplicate touch visibility owners.
- Live picture-in-picture remains available at every responsive size when the
  active browser video supports the capability.

## Verification

Browser coverage must verify automatic `16:9` stage sizing, explicit-height
containment without overflow, `4:3` media containment, immediate pan after a
stage-created crop, placeholder geometry, and consistent behavior in Chromium,
Firefox, and WebKit.
