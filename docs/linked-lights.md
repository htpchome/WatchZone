# Linked Light Control

## Ownership

- Each camera configuration may reference at most two existing Home Assistant
  light entity IDs and an icon for each light. WatchZone does not create or
  duplicate light entities. The default bulb icon has distinct on/off states;
  a custom icon without a state pair is identical in both states.
- The light control is an independently placeable, lazily loaded Stage
  component. The built-in Stage places it in the camera module's overlay slot;
  the component does not import the camera module or another component.
- The component follows active-camera identity through `CameraSessionContext`
  and receives Home Assistant state through the normal placeable runtime.

## Interaction

- A short pointer, touch, Enter, or Space activation toggles the light.
- Holding a light control opens its brightness panel. Arrow Up provides an
  immediate keyboard path to the same panel.
- The brightness panel contains Home Assistant's vertical slider, a visible
  percentage, and an explicit on/off control. It closes when the user clicks
  outside it or presses Escape. While open it holds the camera overlay visible.
- The circular light button fills from bottom to top using the reported or
  pending brightness percentage and the primary theme color. An off light has
  no fill.
- Round overlay controls share one visual treatment, and overlay control/panel
  transparency derives from the single media-overlay opacity token.
- Every icon-only action has a localized accessible name and matching title.

## Home Assistant boundary

Light state remains authoritative in Home Assistant. The component calls the
public `light.turn_on` and `light.turn_off` services with an entity target and
uses `brightness_pct` for dimming. Optimistic fill is presentation state only
and is replaced by the next Home Assistant entity update. Permission or service
failures remain local to the component and produce a bounded error toast.

## Lifecycle and validation

- Changing the active camera closes the brightness panel and selects that
  camera's configured lights without changing either entity's state.
- Removing the component, card, or Stage clears press timers, releases overlay
  holds, and unsubscribes from active-camera state.
- Configuration rejects non-light IDs, duplicates, and more than two lights.
- Browser tests cover touch/pointer-equivalent long press, keyboard access,
  service payloads, active-camera changes, and cleanup in Chromium, Firefox,
  and WebKit.
