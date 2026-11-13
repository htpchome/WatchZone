# Camera Display Zoom

This document defines the implementation contract for display zoom and pan in
the camera module. It supplements `architecture.md`; that document remains
authoritative for application-wide boundaries.

## Ownership

- Camera is the parent module. Display zoom is private camera presentation
  behavior under `frontend/src/stage/modules/camera/live/`.
- The shared `MediaZoomController` exclusively owns zoom scale, bounded pan,
  pointer and keyboard gesture state, resize handling, and cleanup for live and
  recorded media presentations.
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

Each member of an additional-camera group owns a separate live presentation
and `MediaZoomController`. Zooming or panning A never transforms B. Switching a
phone-width group between A and B or focusing one member on desktop preserves
the other member's independent transform for as long as that camera view
remains mounted.

Camera-stage resizing is a separate presentation layer. It changes the stage
ratio and the base contain/cover fit before this controller's transform is
applied. While a user drags an expanded stage back toward its default height,
the stage controller emits only normalized return progress. The camera parent
passes that progress to the live presentation, and the zoom controller alone
interpolates and owns the effective scale and pan. Reversing the drag reverses
the stage-size change but does not restore zoom or pan that has already been
returned toward neutral; releasing partway commits the visible transform.
When a drag begins at the default height, its greatest expansion establishes
the return range, so zooming before a down-and-up resize still reaches `1x`
centered media. Reaching the default stage commits that neutral transform. The
stage controller never writes a transform or imports the zoom controller.

The zoom controller observes the resulting surface bounds and clamps the
effective pan throughout the interaction, so resizing cannot expose blank
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

## Shared media-overlay interaction

Live and recorded video use one `MediaPresentationController` to compose zoom
with transient overlay visibility. The following behavior is normative for
every presentation using that controller:

1. A single touch on the media surface shows hidden controls and starts the
   hide timer immediately.
2. The timer hides the controls without requiring focus loss, pointer exit, or
   another touch outside the presentation.
3. A single touch while controls are visible hides them immediately.
4. Double activation zooms the media and hides the controls. The presentation
   captures the browser `dblclick` default so a recorded video's native controls
   cannot substitute fullscreen for WatchZone display zoom.
5. Drag or pinch interaction hides the controls. Controls remain suppressed
   while display zoom is active and become eligible for the normal touch policy
   after zoom returns to `1x`.

Mouse hover and intentional keyboard focus may hold controls visible when media
is not zoomed. Focus or sticky hover synthesized from a touch must not hold them
visible. Overlay buttons stop pointer propagation and retain their own shared
touch-focus-release behavior, so activating a control does not also toggle the
overlay.

## Bounds and lifecycle

- Scale is clamped to `1x` through `3x`.
- Pan is clamped after every scale, drag, and resize so blank space cannot be
  pulled into view.
- Stage-return interpolation uses compositor-only media transforms and disables
  the normal zoom transition while the handle is moving, so the transform
  follows the pointer without delayed catch-up.
- Pointer capture, active pointer records, and resize observation are released
  on reset or host disconnection.
- Reduced-motion preferences disable the animated transform transition.
- Browser zoom remains separate from optical/provider PTZ.

## Platform exceptions

The standards-based pointer, wheel, and keyboard path is the default on every
platform. A verified Catalyst-specific gesture exception may be added only
inside `MediaZoomController` (or a controller-owned input policy extracted
when actually needed). It must not create a Catalyst media pipeline, provider
branch, or duplicate zoom state.

## Verification

Unit coverage must verify click/tap toggling, the five shared overlay rules,
wheel and trackpad policy, pinch and pan bounds, media-identity reset, keyboard
access, and the media/overlay boundary. Browser coverage must prove recorded
double-click zoom does not enter fullscreen. Browser-visible changes require
the Chromium, Firefox, and WebKit Playwright matrix before handoff.
Physical-device validation remains required for native touch and Catalyst
behavior.
