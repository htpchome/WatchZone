# Camera Carousel

This document defines the camera module's internal Swiper boundary. It
supplements `architecture.md`; that document remains authoritative for
application-wide boundaries.

## Ownership

- Camera remains the application module and composition boundary.
- The carousel is a private camera presentation container. It is not a peer
  frontend module and does not own providers, live connections, camera state,
  or saved layout selection.
- `CameraCarouselController` exclusively owns Swiper import, initialization,
  responsive updates, interaction enablement, and destruction.
- Live presentation remains unaware of Swiper. It owns its existing media,
  zoom, pan, controls, and browser-presentation behavior unchanged.
- A camera-navigation component emits typed selection intent through the layout
  runtime. It does not import or control the camera's Swiper instance and may
  be placed in a generic panel or a compatible module slot.

## Structure and identity

The camera stage contains one `.camera-carousel.swiper`, one
`.swiper-wrapper`, and one stable `.swiper-slide` per configured camera. Each
slide is keyed by camera entity identity so selection and reordering do not
replace a healthy live presentation or its media-session leases. The camera
module accepts at most the centralized `MAX_CAMERAS` limit of twelve entries.

The selected slide owns its frontend transport leases, visible controls,
resize interaction, and audible presentation. Non-selected slides remain
mounted but release transport leases into the document retention policy. One
slide disables movement; multiple slides enable swipe and the
camera-local previous/next chevrons. Those chevrons consume the selected live
presentation's typed overlay-visibility signal, so controls, source badge, and
navigation share one timer rather than maintaining parallel hide timers.

## Loading and lifecycle

Swiper is dynamically imported only after the already-lazy camera module has
rendered its structural slides. The first live session may begin without
waiting for Swiper download or evaluation, and camera-free layouts transfer no
Swiper code.

The selected camera connects immediately. Selection does not wait for or
create a background connection queue. When selection changes, the old slide
releases its leases and the new slide acquires canonical session keys. The
document-scoped retention policy may keep the released logical camera parked;
reselecting it then reattaches without invoking a provider factory. If policy
closed it, the normal provider connection path starts once.

During a direct-manipulation swipe, the camera selection and live lease move as
soon as Swiper selects the destination slide, but the shared selection remains
marked unsettled until Swiper reports the transition complete. Activity
consumers defer camera-specific requests, sorting, and list rendering while
that flag is false. Camera rerenders must not issue a zero-duration `slideTo`
for the index Swiper is already animating toward, because doing so interrupts
the compositor transition the user is controlling.

The carousel does not decide mobile network budgets, expiry, retry, or
provider behavior. It reports selection and device class to the shared session
manager. Backend HLS pre-warming is independent of slide mounting and does not
make a non-selected slide connected in the browser.

The controller initializes once per rendered container, updates only when the
slide count changes, and destroys the instance on host disconnection. A stale
dynamic import cannot initialize a detached or replaced container. The static
single-slide structure remains usable if optional carousel initialization
cannot complete.

## Sizing and stability

- The carousel and every slide fill the camera-owned stage.
- Runtime stage height is one camera-module value shared by every slide.
  Selection never changes stage geometry; each slide independently derives its
  media crop scale from that shared height and its own intrinsic dimensions.
- Swiper does not use `autoHeight`, determine card size, or derive dimensions
  from media metadata.
- The existing reserved stage ratio is present before Swiper loads, so
  initialization does not cause layout shift.
- Swiper transforms only its wrapper. Live zoom transforms only the media
  surface inside a slide, and stage resizing continues to own stage geometry.
- Previous and next navigation are vertically centered on the carousel and use
  one symmetric inline inset. The right navigation remains to the inline-start
  side of the control stack with an explicit gap, while the left navigation
  mirrors that spacing.
  Both scale within fixed minimum and maximum bounds from the carousel's own
  block size rather than from the viewport.

## Gesture policy

- One slide means `allowTouchMove: false`; Swiper must not intercept live zoom,
  pan, controls, stage resizing, or native page navigation.
- Multi-slide mode may enable movement only after explicit arbitration with
  zoomed media and interactive overlays.
- `nested: true` supports a camera carousel inside another Swiper-based layout
  or a card nested inside another card without adding a global gesture path.
- Touch-action restrictions are applied only while carousel movement is
  enabled.

## Transition policy

- Card configuration selects `none`, `slide`, or `fade`; `slide` is the
  normalized default and is omitted from compact YAML output.
- The camera carousel controller owns the Swiper effect for both touch swipes
  and previous/next navigation. Presentation components do not implement a
  second transition path.
- `none` keeps navigation and touch arbitration intact while settling without
  animation. `fade` loads Swiper's fade module only when selected.
- Changing the configured transition preserves the selected camera and does
  not replace or renegotiate its document-scoped media session.

## Verification

Tests verify structural geometry before initialization, single-slide movement
lock, selected-only connection ownership, retained live-element identity,
shared stage height across selection, instance cleanup/reinitialization, lazy
loading for camera-free layouts, and Chromium, Firefox, and WebKit behavior.
