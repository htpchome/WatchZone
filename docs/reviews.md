# Reviews Module Contract

## Identity

- Reviews is the Stage module and provider-neutral feature name.
- Alert and Detection remain review classifications supplied by providers;
  they are not separate module identities.
- The Reviews module is independently lazy-loaded and consumes the normalized
  backend Reviews service. It does not import Events or another placeable.

## Reviewed state

- A review tile exposes its reviewed state as an accessible thumbnail control.
- Reviewed uses the Home Assistant success semantic; unreviewed uses the Home
  Assistant warning semantic. Both use a transparent circle outline with a
  centered checkmark in the same semantic color. The visible circle is small
  while its touch and keyboard target remains at least 44 logical pixels.
- Activating the control updates the local review immediately, calls the
  provider-neutral backend mutation, and rolls back with one toast if the
  provider rejects the change.
- The mutation requires camera-control permission. Providers translate the
  WatchZone review ID and desired boolean into their own authenticated API.
- Review filtering and realtime reconciliation consume the same updated item;
  a second tile-local state model is not permitted.

## Presentation

- Reviews shares the activity-list presentation primitive with Events while
  retaining its own loading, filtering, mutation, and playback orchestration.
- In the built-in Stage, the active list paints beneath the camera-navigation
  and activity-navigation layers during scrolling. A noninteractive cover sits
  between the content and controls and consumes the same Home Assistant card
  background and backdrop-filter semantics as `ha-card`. It is deliberately
  square, borderless, and shadowless so it cannot appear as a nested card.
