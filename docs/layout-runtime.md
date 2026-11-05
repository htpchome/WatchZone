# Frontend Layout Runtime

## Scope

This document records the implemented frontend composition path. The
application-wide ownership and persistence rules remain defined by
`architecture.md`.

## Runtime flow

The Lovelace card shell owns the accessible card name and card-level appearance
only. Its single visual stage contains the layout document rendered by
`LayoutRuntime`; the shell does not place a visual title above the modules.

`LayoutRuntime`:

- Validates a Stage Design catalog and separate ordered desktop/tablet and
  phone flows before selecting the active design.
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

## Stage catalogs and flows

Immutable built-in Stage Design templates are frontend JSON assets. The
built-in catalog adapter namespaces their local IDs and hydrates card-scoped
module and component inputs without adding provider or session behavior to the
template. User-created designs will enter through the backend catalog and the
same validation and rendering path.

Each card supplies an ordered `default` flow and an ordered `phone` flow. The
first compatible design is the landing stage. Runtime selection can move only
to designs already validated for the active flow. A stage may support one or
both responsive profiles; the runtime never fabricates a missing variant.

The initial built-in template contains one stable camera module node and is the
sole entry in both flows. Without camera input, its composition is empty and no
camera module, provider adapter, poster, or media session is requested. Adding
backend designs or navigation changes the catalog and flow, not the renderer.

## Invariants

- Layouts may contain zero, one, or many camera modules.
- Built-in and backend-owned designs use one `StageDesignDocument` contract.
- Flow order, not module order, determines the landing and navigation sequence.
- Module identity comes from stable node IDs, never child order or a
  "camera 1" convention.
- A module never imports another module.
- The card shell does not set camera properties, resolve posters, or acquire
  camera sessions.
- Reordering a node preserves its element identity.
- Removing or failing one module does not remove or fail sibling modules.
- A camera-free layout performs no camera or live-media work.
