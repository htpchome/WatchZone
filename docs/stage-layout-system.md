# Stage Layout System Contract

## Scope and ownership

Python owns user-created Stage Designs, schema validation, revisions,
persistence, and future mutation permissions. TypeScript owns immutable
built-in Stage Design templates, responsive selection, rendering, placeable
loading, draft interaction, and placeholder preview. Built-in and user-created
designs validate into the same versioned document contract and use one
renderer. Lovelace YAML never stores the stage tree.

Built-in templates are frontend JSON assets because users cannot modify them.
They contain composition and geometry only. A small catalog adapter namespaces
their stable IDs and hydrates runtime inputs such as the card's current camera
configuration. Provider behavior, connections, and live state never enter the
template. User-created designs arrive from the backend catalog without a
second layout model.

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
- A generic **panel module** gives a standalone component a grid placement and
  `content` slot. Panel owns no feature behavior or visual treatment. Components
  never sit directly on the raw Stage.

Modules and components are independently lazy loaded. Neither imports another
placeable. Shared behavior uses core contracts and typed context. Provider
mechanics remain below public provider resolvers.

## Version 1 schema

A Stage Design contains a stable ID, name, schema version, optimistic revision,
and at least one responsive variant: `default` for tablet/desktop, `phone`, or
both. Variant presence declares where the design is eligible. Each variant
owns a root grid container. Grid coordinates are positive logical columns and
rows, never CSS pixels. Each grid row declares either `fraction` sizing for
shared remaining space or `content` sizing for intrinsic controls such as a
standalone camera switcher. This keeps fixed-height cards bounded without
assigning feature-specific layout behavior to Panel.

Container children are placements containing one module node and one grid area.
A module node contains its validated configuration and optional named slots.
Slots contain component nodes with their own validated configuration. Node IDs
must be unique within a variant. Corresponding nodes use the same stable IDs in
both variants so switching variants preserves loaded custom elements and live
session leases.

A component node may declare an optional logical `controlRegion` of `leading`,
`center`, or `trailing`. The renderer applies it only inside a `controls` slot;
an omitted value defaults to `center`. This is placement metadata owned by the
slot and is never passed through component configuration.

A Stage Flow is an ordered list of Stage Design IDs for one responsive profile.
Cards have independent `default` and `phone` flows. The first entry is the
landing stage and later entries are navigation targets. A design may appear in
both flows only when it supplies both variants. Flow validation rejects missing
designs, incompatible variants, duplicate IDs, and empty flows before any
placeable loads. Lovelace configuration stores these ordered references, never
copies of the Stage Design documents.

The first built-in composition is:

```text
root grid
├── camera module
│   ├── controls slot (responsive intrinsic-size dock)
│   │   ├── linked-light component (when configured)
│   │   └── two-way-talk component (when enabled)
│   └── overlay slot
│       └── PTZ component (when enabled)
└── panel module
    └── content slot
        └── camera-switcher component
```

The controls slot owns placement, shared gaps, safe-area clearance, and
responsive wrapping for its three logical regions. Its center region remains
geometrically centered while the leading and trailing regions flex equally and
wrap their own controls away from center. Components in that slot render at
their intrinsic control size and must not position themselves relative to
sibling components or the Stage center. Panels and transient notices may paint
outside their dock item without changing the dock's measured control geometry.

## Runtime rules

- Structural validation completes before a placeable loads.
- Catalog and flow validation complete before structural rendering.
- Responsive profile changes preserve an independent active stage selection
  for each flow.
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

The Stage Designer edits user-created backend documents only. Built-in frontend
templates are selectable but immutable. Export, copy, or customize operations
must create a new backend-owned design rather than mutating a built-in asset.

## Editor-only sorting

Reusable ordered editor tiles use a local Pointer Events/pointer-capture path
inside the lazy editor graph. They do not rely on document-level drag matching,
which cannot identify internal elements after Home Assistant's nested shadow
roots retarget events. Keyboard reordering remains a first-class path and
reduced motion removes reorder animation. The generated editor entry is
mechanically capped at 12 KiB gzip by build validation.
