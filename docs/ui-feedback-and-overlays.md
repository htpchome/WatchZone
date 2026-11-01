# UI Feedback and Overlay Contract

## 1. Purpose and ownership

WatchZone uses one shared feedback primitive and one shared transient-visibility
controller. These systems prevent feature-local timers, inconsistent toasts,
and overlapping media overlays.

- `frontend/src/ui/toast.ts` owns categorized feedback behavior and its public
  API.
- `frontend/src/ui/toast.styles.ts` owns toast presentation.
- `frontend/src/ui/timed-visibility.controller.ts` owns transient visibility
  timing and cleanup.
- A feature owns the placement of its overlay lanes and the decision to emit
  feedback; it does not reimplement feedback timing or transitions.

## 2. Toast contract

`ToastElement` is context-neutral. A live video, event list, configuration
surface, or future module may host it without importing camera behavior. Its
typed API accepts:

- Category: `neutral`, `success`, `warning`, or `error`.
- Presentation: overlay or inline.
- Logical overlay placement: top/bottom and start/center/end.
- Duration, or an explicit persistent mode.

Transient feedback is the default. Persistent mode is reserved for information
that remains actionable or true and must be selected explicitly. Blocking
states with actions, such as a failed camera plus Retry, remain in-context
status surfaces rather than disappearing as toasts.

Categories are semantic, not decorative. Error feedback uses assertive live
announcement; all other categories use polite status announcement. Appearance
comes exclusively from `--wzc-toast-*` tokens. Neutral overlay feedback matches
the shared translucent media-overlay family, while success, warning, and error
use their corresponding semantic backgrounds.

## 3. Visibility and transition contract

`TimedVisibilityController` owns at most one hide timer. Revealing again resets
that timer, hiding cancels it, and host disconnection clears all pending work.
Components use the controller for state timing; CSS owns opacity, movement,
reduced-motion behavior, and visual transitions.

Camera controls and the initial source label use the same controller class and
the same named camera-overlay delay. They are independent states with shared
behavior: Connecting remains visible while unresolved, the first source appears
briefly after selection, and later source visibility follows control
interaction.

## 4. Media-overlay layout and input invariants

Media overlays share semantic geometry tokens for safe insets, control size,
gaps, and lane spacing. When the control rail is visible, the source label
reserves the rail's inline lane instead of occupying the same top-end corner.
Container queries update both consumers from the same responsive values.

Browser `safe-area-inset-*` values describe the full viewport, not an embedded
dashboard card. Embedded modules therefore keep the shared safe-area inset
tokens at zero and use their ordinary overlay spacing. Only an owning
fullscreen container maps the browser environment insets into those tokens;
source labels, controls, and toasts consume the resolved tokens and never read
the global environment insets independently.

Hover styling is enabled only for a fine pointer that reports hover support.
The controls also record the latest pointer modality so a touch or pen
interaction cannot retain an emulated/sticky hover or focus appearance on
hybrid and WebKit clients. Keyboard interaction restores visible focus;
keyboard accessibility is never removed globally.

## 5. Extension rules

- Add a toast category only when it represents a new semantic state, and add
  its tokens and accessibility behavior in the same change.
- Add a presentation or placement to the toast class rather than cloning it in
  a feature.
- Do not create feature-local fade timers or toast keyframes.
- Do not use a toast for a blocking state that requires a persistent action.
- New overlay controls must join the owning feature's lane contract and must be
  tested at phone, tablet, and desktop container sizes.

## 6. Verification

- `frontend/tests/timed-visibility-controller.test.ts` verifies reset and
  cleanup behavior.
- `frontend/tests/toast.test.ts` verifies categories, accessibility roles,
  expiry, persistence, presentation, and placement.
- `frontend/tests/controls-visibility-controller.test.ts` verifies camera
  hover/touch visibility timing.
- `frontend/tests/browser/smoke.spec.ts` verifies real-engine opacity, touch
  resting state, embedded overlay edge spacing, source/control lane separation
  at 320 CSS pixels, responsive sizing, and synchronized source/control
  visibility.
