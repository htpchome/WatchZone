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
`.swiper-wrapper`, and stable `.swiper-slide` children. Each future slide is
keyed by stable camera identity so ordinary selection and rendering do not
replace a healthy live presentation or its retained media-session lease.

The current implementation has exactly one slide containing the existing live
presentation. Touch movement remains disabled with one slide. Swiper is still
initialized so its real lifecycle and responsive behavior are established
before multi-camera work begins.

## Loading and lifecycle

Swiper is dynamically imported only after the already-lazy camera module has
rendered its structural slide. The live session may begin without waiting for
Swiper download or evaluation, and camera-free layouts transfer no Swiper
code.

The controller initializes once per rendered container, updates only when the
slide count changes, and destroys the instance on host disconnection. A stale
dynamic import cannot initialize a detached or replaced container. The static
single-slide structure remains usable if optional carousel initialization
cannot complete.

## Sizing and stability

- The carousel and every slide fill the camera-owned stage.
- Swiper does not use `autoHeight`, determine card size, or derive dimensions
  from media metadata.
- The existing reserved stage ratio is present before Swiper loads, so
  initialization does not cause layout shift.
- Swiper transforms only its wrapper. Live zoom transforms only the media
  surface inside a slide, and stage resizing continues to own stage geometry.

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
lock, instance cleanup/reinitialization, lazy loading for camera-free layouts,
retained live-element identity, and Chromium, Firefox, and WebKit behavior.
