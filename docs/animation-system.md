# Animation System Contract

## Status and scope

This document is normative. It governs every time-based visual transition in
the CameraOptics frontend, including entrances, exits, visibility fades, layout
settlement, carousel transitions, animated scrolling, spinners, gesture snap,
zoom settlement, disclosure indicators, and continuous visualizations.

## Single engine

Motion is the only animation engine used by CameraOptics. The shared boundaries
under `frontend/src/ui/motion.ts` and `frontend/src/ui/motion-value.ts` are the
only sources allowed to start Motion animations.

The following parallel animation paths are prohibited:

- CSS `transition`, `animation`, or `@keyframes` declarations;
- direct `Element.animate()` or other direct Web Animations API construction;
- browser `smooth` scrolling;
- feature-owned `requestAnimationFrame` tween loops;
- nonzero Swiper transition timing or another dependency's animation engine.

`requestAnimationFrame` remains valid for coalescing measurement, input, and
DOM writes into a frame. It must not interpolate elapsed time or become a
second animation clock.

## Ownership

Motion presents a transition; it never becomes the source of application
state or geometry policy. The owning feature commits the target semantic state
first and supplies Motion with the visual path to that state.

- One owner animates a property on an element at a time.
- A replacement animation cancels the previous animation before starting.
- Component or controller disconnection cancels every animation it owns.
- Finished effects are canceled or retained by one explicit owner; they are
  never abandoned as untracked browser animations.
- Direct manipulation may write the pointer-following value immediately.
  Motion owns only the release or snap transition.
- Layout measurement completes before a layout animation starts. Motion must
  not introduce another geometry, clipping, or containing-block owner.

## Shared policy

Durations and easing curves come from the shared Motion boundary. Feature code
may introduce a distinct value only for a demonstrated interaction contract,
and keeps that value next to the owning feature until it has a second real
consumer.

Reduced-motion preference is applied at the shared boundary. A feature does
not create a CSS media-query fallback or a separate reduced-motion engine.
Continuous semantic visualizations, such as a live audio meter, may continue
when reduced motion is requested, but that exception is explicit at the Motion
call site.

DOM animation uses Motion's mini entry by default. Numeric or continuous
animation uses the full Motion engine only through the numeric boundary. Lazy
features must keep their Motion code within the existing lazy graph; adding
Motion must not eagerly load an otherwise unused feature.

## Dependency-owned interaction

Libraries may continue to own direct manipulation when their value follows the
user's pointer without elapsed-time interpolation. Their timed settlement must
be disabled. For the camera carousel, Swiper retains touch arbitration and
slide geometry with `speed: 0`; CameraOptics Motion owns the configured slide or
fade transition and its actual completion lifecycle.

## Orientation transactions

Companion orientation settlement is an atomic layout transaction, not an
animation. The existing Stage surface enters the browser top layer, remains
covered while its authoritative layout profile and safe-area geometry settle,
and is exposed only after Lit finishes the target render. A FLIP transition may
capture geometry only after that transaction has stable before and after
states. It must not animate, reveal, or preserve an intermediate responsive
layout.

## Validation

Automated architecture checks reject CSS animation declarations and direct
animation calls outside the Motion boundary. Tests cover cancellation,
disconnect cleanup, reduced motion, replacement during an active transition,
and actual completion rather than duration-matched cleanup timers.

Browser-visible animation changes require Chromium, Firefox, and WebKit
coverage. Touch, orientation, Companion, and Catalyst behavior remains
physically unverified until tested on the corresponding client.
