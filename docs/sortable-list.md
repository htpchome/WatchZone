# Sortable List Component

`wzc-sortable-list` and `wzc-sortable-tile` are reusable UI primitives. They
are not application modules and do not own camera configuration or feature
state.

## Ownership

- Pragmatic Drag and Drop owns cross-input drag lifecycle. The list owns local
  vertical geometry, fluid sibling displacement, and one typed reorder intent.
- A tile owns its registered drag handle, transient visual drag state, slotted
  content, slotted actions, and registration cleanup.
- The consuming feature owns the ordered data, validation, dirty-state update,
  preview update, and persistence.
- Reordering never mutates light-DOM children directly. The owner updates its
  data once and Lit reconciles the keyed tiles.

## Interaction

- Drag uses Pragmatic's element adapter and is loaded only with the editor.
- The original custom pointer-capture drag path has been removed; it must not
  be layered beneath or beside Pragmatic.
- Arrow Up and Arrow Down on the focused handle provide keyboard reordering.
- The emitted detail contains stable item identity plus absolute source and
  destination indices.
- Action buttons are slotted separately so edit/delete activation never begins
  a drag.

The component derives its element names and events from centralized identity
constants and consumes only semantic `--wzc-*` styling tokens.

Pragmatic core may add at most 10 kB gzip to the lazy editor graph and must add
zero bytes to the normal card entry. Reordering honors reduced-motion and keeps
the blue leading edge, left drag handle, and separately activated actions.
