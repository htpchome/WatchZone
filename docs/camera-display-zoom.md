# Camera Display Zoom

This document defines the implementation contract for display zoom and pan in
the camera module. It supplements `architecture.md`; that document remains
authoritative for application-wide boundaries.

## Ownership

- Camera is the parent module. Display zoom is private camera presentation
  behavior under `frontend/src/modules/camera/live/`.
- `CameraZoomController` exclusively owns zoom scale, bounded pan, pointer and
  keyboard gesture state, resize handling, and cleanup.
- The live presentation supplies the media surface and renders controller
  state. It does not implement a second gesture path.
- Provider adapters and retained media sessions do not know about display
  zoom. Changing HLS, WebRTC, a fallback image, or a future connection source
  must not reset zoom for the same camera.
- Zoom does not depend on Swiper. A future carousel may compose the camera
  module without inheriting or duplicating its gesture implementation.

## Presentation boundary

One transformed media surface contains, back to front:

1. The generic fallback.
2. The authenticated camera fallback image.
3. The HLS media host.
4. The WebRTC video.

Controls, connection/source status, and toast regions are siblings outside the
transformed surface. They remain fixed and interactive while media is zoomed or
panned.

Zoom is keyed by stable camera identity. Replacing the active transport or
moving between fallback and live media retains the current transform. Selecting
a different camera resets to `1x` so one camera cannot inherit another camera's
view.

Camera-stage resizing is a separate presentation layer. It changes the stage
ratio and the base contain/cover fit before this controller's transform is
applied. It never writes zoom scale or pan state. The zoom controller observes
the resulting surface bounds and reclamps pan, so resizing cannot expose blank
space or create a second transform owner.

## Input policy

| Input                             | Behavior                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Mouse primary double-click        | Toggle `1x` and `2x` at the pointer position.                                  |
| Discrete mouse wheel              | Zoom in fixed increments between `1x` and `3x`.                                |
| Trackpad pinch or modified wheel  | Leave unconsumed so native browser and operating-system behavior is preserved. |
| Unmodified smooth pixel scrolling | Leave unconsumed so compact dashboard and page navigation continue to scroll.  |
| Double touch or pen tap           | Toggle `1x` and `2x` at the contact position.                                  |
| Two touch or pen contacts         | Pinch continuously between `1x` and `3x`.                                      |
| Pointer drag while zoomed         | Pan within the visible media bounds.                                           |
| Enter or Space                    | Toggle `1x` and `2x` from the center.                                          |
| Plus or Minus                     | Zoom in or out in fixed increments.                                            |
| Arrow keys                        | Pan while zoomed.                                                              |
| Zero or Escape                    | Reset to `1x`.                                                                 |

Browsers do not expose a reliable hardware identity for an unmodified wheel
event. The controller therefore distinguishes discrete wheel input from smooth
pixel scrolling by event shape. Control- or Command-modified wheel events are
always left to the browser so macOS trackpad pinch and other native gestures are
not replaced. The controller must not globally cancel wheel events or infer a
permanent device class from one gesture.

At `1x`, native one-finger page panning remains available. While zoomed, the
media surface owns drag gestures so panning cannot leak into dashboard
navigation. A drag or pinch clears the pending double-activation sequence and
never activates zoom toggling.

## Bounds and lifecycle

- Scale is clamped to `1x` through `3x`.
- Pan is clamped after every scale, drag, and resize so blank space cannot be
  pulled into view.
- Pointer capture, active pointer records, and resize observation are released
  on reset or host disconnection.
- Reduced-motion preferences disable the animated transform transition.
- Browser zoom remains separate from optical/provider PTZ.

## Platform exceptions

The standards-based pointer, wheel, and keyboard path is the default on every
platform. A verified Catalyst-specific gesture exception may be added only
inside `CameraZoomController` (or a controller-owned input policy extracted
when actually needed). It must not create a Catalyst media pipeline, provider
branch, or duplicate zoom state.

## Verification

Unit coverage must verify click/tap toggling, wheel and trackpad policy, pinch
and pan bounds, camera-identity reset, keyboard access, and the media/overlay
boundary. Browser-visible changes require the Chromium, Firefox, and WebKit
Playwright matrix before handoff. Physical-device validation remains required
for native touch and Catalyst behavior.
