# Stage Layout System Contract

## Scope and ownership

Python owns saved Stage Designs, schema validation, revisions, persistence, and
future mutation permissions. TypeScript owns responsive selection, rendering,
placeable loading, draft interaction, and placeholder preview. Lovelace YAML
never stores the stage tree.

The current built-in stage is a transitional seed from the card's camera input.
It uses the same schema and renderer as saved designs. It is not a second layout
model. A later saved-stage selector replaces that seed without replacing the
runtime contract.

## Placeable vocabulary

- A **module** is a major stage content system that may publish semantic slots.
  Camera and the future events surface are modules.
- A **component** is a portable capability presentation placed in a compatible
  module slot. PTZ and two-way talk are components.
- A **container** owns logical grid placement. It owns no feature behavior.
- A **slot** is a named placement surface: `content`, `overlay`, `controls`, or
  `footer`.
- A **presentation** is private rendering inside its owner. Camera live video is
  a camera presentation, not another module or component.

Modules and components are independently lazy loaded. Neither imports another
placeable. Shared behavior uses core contracts and typed context. Provider
mechanics remain below public provider resolvers.

## Version 1 schema

A Stage Design contains a stable ID, name, schema version, optimistic revision,
and two required variants: `default` for tablet/desktop and `phone`. Each
variant owns a root grid container. Grid coordinates are positive logical
columns and rows, never CSS pixels.

Container children are placements containing one module node and one grid area.
A module node contains its validated configuration and optional named slots.
Slots contain component nodes with their own validated configuration. Node IDs
must be unique within a variant. Corresponding nodes use the same stable IDs in
both variants so switching variants preserves loaded custom elements and live
session leases.

The first built-in composition is:

```text
root grid
└── camera module
    └── overlay slot
        ├── two-way-talk component (when enabled)
        └── PTZ component (when enabled)
```

## Runtime rules

- Structural validation completes before a placeable loads.
- Each placeable validates its own config at its lazy boundary.
- Unknown or failed placeables fail locally and do not block siblings.
- Responsive variant selection uses the card container's inline size.
- Variant changes reuse records by stable node ID and compatible type.
- The renderer never owns media sessions. Moving or replacing a presentation
  surface follows the lease and attachment rules in
  `docs/live-session-lifecycle.md`.
- Stage Designer previews use placeholders for live media and provider-heavy
  content; designing a layout must not create camera connections.

## Persistence and designer boundary

`StageDesignStore` uses Home Assistant's atomic `Store`, validates before
replacement, and increments revisions optimistically. A stale expected revision
must fail rather than overwrite another editor. Invalid stored entries are
isolated so they cannot prevent valid designs or integration setup.

The future Stage Designer is desktop/tablet only and may use GridStack behind a
small designer adapter. GridStack data is interaction state, not the persisted
schema. The runtime renderer and ordinary cards must not import GridStack.

## Editor-only sorting

Reusable ordered editor tiles use Pragmatic Drag and Drop only inside the lazy
editor graph. The dependency must add zero bytes to the normal card entry and
no more than 10 kB gzip to the editor graph. Keyboard reordering remains a
first-class path and reduced motion removes reorder animation. The generated
editor entry is mechanically capped at 19 KiB gzip by build validation.
