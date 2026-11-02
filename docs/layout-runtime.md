# Frontend Layout Runtime

## Scope

This document records the implemented frontend composition path. The
application-wide ownership and persistence rules remain defined by
`architecture.md`.

## Runtime flow

The Lovelace card shell owns card-level title and appearance only. It converts
the current narrow card input into a default layout document and passes that
document to `LayoutRuntime`.

`LayoutRuntime`:

- Validates container and module-node structure before rendering.
- Rejects duplicate node IDs.
- Preserves module elements by stable node ID rather than list position.
- Loads only module types referenced by the active layout.
- Caches successful module-definition imports by type.
- Loads different referenced module types concurrently.
- Contains import, validation, and unknown-module failures to the affected
  module slot.
- Updates a module only when its runtime transport or declared Home Assistant
  entity references change.
- Removes a module element when its node is removed; the element releases its
  media lease while the document-scoped session manager applies retention
  policy.

The compile-time loader map contains lazy import functions and minimal loading
surface metadata. It does not import module implementations into the eager
card graph.

## Module contract

A public module definition owns:

- Its stable module type.
- Configuration validation.
- Custom-element definition and creation.
- The Home Assistant entity IDs it consumes.
- Narrow property updates from runtime context.
- Optional cancellable preparation required for measured startup behavior.

The camera definition begins its pooled WebRTC preparation while its visual
implementation is being imported. Once the camera element mounts, the generic
runtime releases the preparation lease; the camera element's visible lease
reuses the same document-scoped session.

## Default layout

Until a saved Python layout is selected, the narrow Lovelace camera input
creates a default layout containing one stable camera module node. This node is
not primary, active, or otherwise privileged by the runtime. Without a camera
input, the default layout is empty and no camera module, provider adapter,
poster, or media session is requested.

The default-layout adapter remains the fallback for cards that do not select a
saved layout. A future Python layout source replaces the document supplied to
the same runtime; it does not introduce another renderer.

## Invariants

- Layouts may contain zero, one, or many camera modules.
- Module identity comes from stable node IDs, never child order or a
  "camera 1" convention.
- A module never imports another module.
- The card shell does not set camera properties, resolve posters, or acquire
  camera sessions.
- Reordering a node preserves its element identity.
- Removing or failing one module does not remove or fail sibling modules.
- A camera-free layout performs no camera or live-media work.
