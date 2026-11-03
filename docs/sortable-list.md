# Sortable List Component

`wzc-sortable-list` and `wzc-sortable-tile` are reusable UI primitives. They
are not application modules and do not own camera configuration or feature
state.

## Ownership

- The list owns pointer geometry and translates drag movement into one typed
  reorder intent.
- A tile owns its drag handle, transient visual drag state, slotted content,
  and slotted actions.
- The consuming feature owns the ordered data, validation, dirty-state update,
  preview update, and persistence.
- Reordering never mutates light-DOM children directly. The owner updates its
  data once and Lit reconciles the keyed tiles.

## Interaction

- Pointer drag works through pointer capture and supports mouse, pen, and
  touch without separate implementations.
- Arrow Up and Arrow Down on the focused handle provide keyboard reordering.
- The emitted detail contains stable item identity plus absolute source and
  destination indices.
- Action buttons are slotted separately so edit/delete activation never begins
  a drag.

The component derives its element names and events from centralized identity
constants and consumes only semantic `--wzc-*` styling tokens.
