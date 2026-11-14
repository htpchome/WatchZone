# Shared Accordion

The shared accordion is a UI primitive under `frontend/src/ui/`; it is not an
application module and owns no configuration or feature state.

## Contract

- `wzc-accordion` coordinates direct `wzc-accordion-item` children.
- Toggle events from nested accordions do not affect an ancestor accordion.
- Items use native `details` and `summary` semantics for keyboard and assistive
  technology support.
- All items start closed unless the parent receives one `initial-open` key.
- Opening an item closes every other item in the same accordion.
- An accordion marked `require-open` restores its active item if a user tries
  to close it programmatically, so exactly one item remains expanded. User
  activation of the sole open summary is canceled before native `details`
  state changes, avoiding a visible close/reopen cycle. Other accordions retain
  the normal zero-or-one-open behavior.
- Feature and editor code own headings, icons, and slotted content. The
  accordion owns only disclosure state, presentation, and reveal scrolling.
- Items use the comfortable density by default. Nested editor dialogs may use
  the compact density and an optional short summary value without creating a
  second disclosure implementation.
- When an opened item and the following header already fit in the nearest
  scroll container, no scrolling occurs. Otherwise the opened item is aligned
  to the scroll container's top. This shows its complete content and the next
  header when space permits; content taller than the viewport still starts at
  the top.
- Scrolling follows composed ancestors so the primitive works inside nested
  shadow roots. Reduced-motion preference disables smooth scrolling.
- Reveal scrolling is coalesced to one animation-frame request and canceled
  when a newer disclosure action occurs or the accordion disconnects.
- Styling consumes semantic `--wzc-accordion-*` tokens defined at the sole
  Home Assistant theme boundary.

The current card editor uses six closed-by-default groups: Camera Settings,
Live Media Player, Recorded Media Player, General Settings, Layout Settings,
and Display Settings. Opening and closing a group is presentation state only and
never changes dirty state or card YAML.

The nested camera editor initially opens Camera and requires exactly one of its
five sections to remain open. Editing a compact secondary-camera tile instead
initially opens Additional Camera in the owning group draft.
