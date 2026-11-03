# Camera Presentation Layout

This document defines the sizing contract between the Home Assistant card,
camera module, and live presentation. It supplements `architecture.md`; that
document remains authoritative for application-wide boundaries.

## Ownership

- Home Assistant owns the card's allocated grid rectangle.
- The card shell owns title, outer padding, and the remaining content track.
- The camera module owns the camera stage and its appearance.
- The live presentation fills the camera stage. It does not determine card or
  dashboard dimensions from media metadata.
- Media elements own only how their intrinsic content fits inside the stage.

## Default sizing

The card advertises Home Assistant's `full` width and explicit automatic row
sizing in sections view. Home Assistant does not expose an automatic-width
grid value; `full` makes a new card consume its entire available section row,
including a section that spans multiple columns. Content determines the
default height. The camera stage reserves `--wzc-camera-stage-aspect-ratio`,
which defaults to `16 / 9`. The title, gap, and outer padding are outside that
ratio.

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
- The runtime stage-height handle may expand the stage from its `16:9` default
  to a guarded maximum of `1:1`. It is transient presentation state, keyed by
  the camera-module instance, and does not alter YAML or provider state. Every
  carousel slide receives the same height ratio, so changing cameras preserves
  stage geometry while each camera retains its independent media dimensions,
  zoom, and pan.
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
camera parent. The parent applies that ratio to every stable carousel slide;
the views do not create per-camera stage-height state. Dragging down increases
height; dragging up reduces it. Arrow keys, Home, and End provide keyboard
access, and double-click/double-tap resets the stage. The resize handle owns
only its own touch gesture and does not replace native page scrolling
elsewhere.

Stage sizing is separate from user display zoom. Resizing changes the viewport
and reports only the base presentation scale required to fill it. The
`CameraZoomController` remains the sole transform and pan-bound owner and
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

## Verification

Browser coverage must verify automatic `16:9` stage sizing, explicit-height
containment without overflow, `4:3` media containment, immediate pan after a
stage-created crop, placeholder geometry, and consistent behavior in Chromium,
Firefox, and WebKit.
