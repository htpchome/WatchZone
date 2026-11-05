# Sortable List Component

`wzc-sortable-list` and `wzc-sortable-tile` are reusable UI primitives. They
are not application modules and do not own camera configuration or feature
state.

## Ownership

- The tile owns one Pointer Events/pointer-capture drag lifecycle that remains
  local to its shadow root. The list owns local vertical geometry, fluid
  sibling displacement, and one typed reorder intent.
- A tile owns its registered drag handle, transient visual drag state, slotted
  content, slotted actions, and registration cleanup.
- The consuming feature owns the ordered data, validation, dirty-state update,
  preview update, and persistence.
- Reordering never mutates light-DOM children directly. The owner updates its
  data once and Lit reconciles the keyed tiles.

## Interaction

- Drag uses the browser Pointer Events and pointer-capture APIs so mouse, pen,
  and touch follow one path without document-global listeners. This is
  required because drag events are retargeted at Home Assistant's nested
  shadow boundaries and cannot be matched reliably by document-level element
  registries.
- Pointer cancellation and lost capture reset the complete transient drag
  state without emitting a reorder.
- Pointer release hands the current visual geometry through the owner's keyed
  Lit reconciliation, then settles once into the new slot. The lifted shadow
  remains until that settle completes, so a tile never snaps back to its old
  slot before moving to the new one.
- During reconciliation, the FLIP settle is the sole transform-animation
  authority for every tile. Normal displacement transitions remain disabled
  until the whole list has settled, preventing a CSS transition and the FLIP
  animation from pulling a tile in opposite directions.
- Drag and settle geometry is measured from the rendered tile surface inside
  its shadow root, never from the stationary custom-element host. This keeps
  the first settle frame at the pointer-release position.
- Arrow Up and Arrow Down on the focused handle provide keyboard reordering.
- The emitted detail contains stable item identity plus absolute source and
  destination indices.
- Action buttons are slotted separately so edit/delete activation never begins
  a drag.

The component derives its element names and events from centralized identity
constants and consumes only semantic `--wzc-*` styling tokens.

The sorter has no runtime dependency and adds zero bytes to the normal card
entry. Reordering honors reduced-motion and keeps the blue leading edge, left
drag handle, and separately activated actions.
