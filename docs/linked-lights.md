# Linked Light Control

## Ownership

- Each camera configuration may reference at most two existing Home Assistant
  light entities. Each reference may also store an optional Material Design
  icon selected with Home Assistant's icon selector. WatchZone does not create
  or duplicate light entities.
- The camera editor selects the entity and optional icon together before a
  linked light is added. Selecting an entity already linked to that camera
  produces immediate inline feedback and cannot create a duplicate.
- The light control is an independently placeable, lazily loaded Stage
  component. The built-in Stage places it in the camera module's responsive
  controls slot; the component does not import the camera module or another
  component and does not calculate sibling-control placement.
- The component follows active-camera identity through `CameraSessionContext`
  and receives Home Assistant state through the normal placeable runtime.

## Interaction

- A short pointer, touch, Enter, or Space activation toggles the light.
- Holding a light control opens its brightness panel. Arrow Up provides an
  immediate keyboard path to the same panel.
- The brightness panel uses Home Assistant's vertical `ha-control-slider` with
  a persistent handle, bottom-up primary-color fill, an interaction-only
  percentage tooltip, and an explicit on/off control. Pointer or touch input
  outside the panel closes it; there is no redundant close button. While open
  it holds the camera overlay visible. On a phone-sized card the panel narrows
  to fit the stage without shrinking the light button, slider thickness, or
  power button below their usable control sizes.
- The circular light button fills from bottom to top using the reported or
  pending brightness percentage. An off light has no fill.
- Hovering a light control acquires the same shared overlay hold used by the
  camera controls. Leaving releases the hold and restarts the common hide
  timer; the light control does not own a second timer.
- Every icon-only action has a localized accessible name and matching title.

## Home Assistant boundary

Light state remains authoritative in Home Assistant. The component calls the
public `light.turn_on` and `light.turn_off` services with an entity target and
uses `brightness_pct` for dimming. Optimistic fill is presentation state only
and is replaced by the next Home Assistant entity update. Permission or service
failures remain local to the component and produce a bounded error toast.
After a Home Assistant restart, the control accepts the restored entity state
as soon as Home Assistant republishes it; WatchZone does not poll or preserve a
stale light state while the owning integration is still starting.

## Lifecycle and validation

- Changing the active camera closes the brightness panel and selects that
  camera's configured lights without changing either entity's state.
- Removing the component, card, or Stage clears press timers, releases overlay
  holds, and unsubscribes from active-camera state.
- The canonical YAML shape is an ordered `lights` array containing
  `{ entity_id, icon? }` objects. The former `light_entity_ids` array is read
  only as a one-way compatibility migration and is never written back.
- Configuration rejects non-light IDs, invalid icons, duplicates, and more
  than two lights.
- Browser tests cover touch/pointer-equivalent long press, keyboard access,
  service payloads, active-camera changes, and cleanup in Chromium, Firefox,
  and WebKit.
