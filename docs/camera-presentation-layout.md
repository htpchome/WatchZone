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
- Future crop, cover, and object-position choices change media fitting, not the
  parent card's sizing contract.

## Performance and stability

- Layout uses CSS sizing and intrinsic aspect ratio; it does not use JavaScript
  measurement or `ResizeObserver` to control card geometry.
- Space is reserved before the lazy camera module or media loads, preventing
  source selection and fallback replacement from producing layout shifts.
- The authenticated fallback image remains eligible to paint before live media
  and occupies the final media box.
- Size changes are not animated. User-driven Home Assistant resizing may
  reflow, but connection, poster, and transport changes may not.

## Verification

Browser coverage must verify automatic `16:9` stage sizing, explicit-height
containment without overflow, `4:3` media containment, placeholder geometry,
and consistent behavior in Chromium, Firefox, and WebKit.
