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
- Clicking an open item closes it, so every accordion permits either zero or
  one open item.
- Feature and editor code own headings, icons, and slotted content. The
  accordion owns only disclosure state, presentation, and reveal scrolling.
- An owner may mark an item `pending` to highlight its closed header. Pending
  state is presentation input only: the accordion does not derive, clear, or
  persist it, and the existing open-header treatment remains authoritative
  while the item is open.
- Each item publishes the centralized composed toggle event with its item and
  resolved open state. Owners may use that event to mount disclosed content;
  nested accordion events remain scoped to their direct accordion.
- Items use the comfortable density by default. Nested editor dialogs may use
  the compact density and an optional short summary value without creating a
  second disclosure implementation.
- When an opened item and the following header already fit in the nearest
  scroll container, no scrolling occurs. Otherwise the opened item is aligned
  to the scroll container's top. This shows its complete content and the next
  header when space permits; content taller than the viewport still starts at
  the top.
- Scrolling follows composed ancestors so the primitive works inside nested
  shadow roots. Motion owns the scroll interpolation and reduced-motion
  preference makes it immediate.
- Reveal scrolling is coalesced to one animation-frame request and canceled
  when a newer disclosure action occurs or the accordion disconnects.
- Styling consumes semantic `--wzc-accordion-*` tokens defined at the sole
  Home Assistant theme boundary.

The main card editor keeps every applicable header mounted but mounts only the
open group's body. Closing a group removes its controls from the DOM; reopening
reconstructs them from the top-level normalized draft. Disclosure changes are
presentation state only and never change dirty state or card YAML. Section
renderers and Home Assistant controls do not own a second draft.

The editor derives each header's pending state from that section's normalized
draft fields compared with the normalized baseline. Optional interaction
presence is part of the Interactions section state. Reverting all fields owned
by a section removes its pending highlight even when other sections still have
unsaved changes.

The nested camera editor initially opens Camera, then follows the same
zero-or-one-open behavior as the main editor. Editing a compact
secondary-camera tile instead initially opens Additional Camera in the owning
group draft.
