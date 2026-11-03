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
- A future camera-switcher module emits typed selection intent through the
  layout runtime. It does not import or control the camera's Swiper instance.

## Structure and identity

The camera stage contains one `.camera-carousel.swiper`, one
`.swiper-wrapper`, and one stable `.swiper-slide` per configured camera. Each
slide is keyed by camera entity identity so selection and reordering do not
replace a healthy live presentation or its media-session leases. The camera
module accepts at most the centralized `MAX_CAMERAS` limit of twelve entries.

The selected slide owns visible controls, resize interaction, and audible
presentation. Non-selected slides remain mounted and connected but are forced
muted. One slide disables movement; multiple slides enable swipe and the
camera-local previous/next chevrons. Those chevrons consume the selected live
presentation's typed overlay-visibility signal, so controls, source badge, and
navigation share one timer rather than maintaining parallel hide timers.

## Loading and lifecycle

Swiper is dynamically imported only after the already-lazy camera module has
rendered its structural slides. The first live session may begin without
waiting for Swiper download or evaluation, and camera-free layouts transfer no
Swiper code.

Configured cameras connect sequentially in display order. The queue enables
camera zero, waits until it has selected a live source or reached a terminal
unavailable/failed/suspended state, and then enables the next camera. All
enabled cameras retain active session leases; carousel selection does not
release them. A retained healthy session satisfies its queue position without
renegotiation. A real Home Assistant transport interruption resets the ordered
gate, while an ordinary render or selection change does not.

Selecting a camera that has not reached its ordered queue position promotes
that camera into connection immediately. Promotion does not cancel the camera
already loading, does not create a second queue entry or media-session key, and
does not reorder the remaining background work. When the ordered worker
advances, it skips every camera that was already promoted and continues in
configured display order. Repeated navigation only reuses the stable slide and
retained leases; it never reacquires a healthy HLS or WebRTC session.

The initial policy connects every configured camera. A future per-camera
preload option may opt individual cameras out, but it must extend this single
queue rather than introduce a parallel lifecycle.

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
- Previous and next navigation are vertically centered on the carousel, remain
  at its outer inline edges, and scale within fixed minimum and maximum bounds
  from the carousel's own block size rather than from the viewport.

## Gesture policy

- One slide means `allowTouchMove: false`; Swiper must not intercept live zoom,
  pan, controls, stage resizing, or native page navigation.
- Multi-slide mode may enable movement only after explicit arbitration with
  zoomed media and interactive overlays.
- `nested: true` supports a camera carousel inside another Swiper-based layout
  or a card nested inside another card without adding a global gesture path.
- Touch-action restrictions are applied only while carousel movement is
  enabled.

## Verification

Tests verify structural geometry before initialization, single-slide movement
lock, ordered connection enablement, retained live-element identity,
shared stage height across selection, instance cleanup/reinitialization, lazy
loading for camera-free layouts, and Chromium, Firefox, and WebKit behavior.
