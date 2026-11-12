# Exports

Exports are provider-persistent video ranges that are kept separately from
ordinary recording retention. The first implementation uses Frigate exports,
but the Stage module and frontend transport remain provider-neutral.

## Ownership boundaries

- The Exports Stage module owns the mixed-camera library presentation and emits
  media-viewer requests. It does not import another module or placeable.
- Stage owns stack navigation and the camera filter control. A filter context
  keyed by placeable ID carries typed camera facets and selection between Stage
  and the active Exports instance.
- The shared media-viewer feature owns export playback and the distinct export
  dialog presentation.
- Python owns provider discovery, normalization, authorization, mutations, and
  authenticated media proxying. The frontend never receives Frigate
  credentials or provider filesystem paths.
- Frigate action, endpoint, and version compatibility belongs only to the
  Frigate provider adapter.
- Reviews may request export preparation and creation through the normalized
  Exports API contract. Reviews does not import or mutate the Exports Stage
  module.
- A shared UI button foundation owns cursor, focus, disabled, icon, and primary
  contrast behavior. Activity and export presentations supply only their local
  geometry and semantic variants.

## Library behavior

- A newly activated Exports module requests exports for every camera exposed by
  its configured target camera module and presents one newest-first mixed list.
- The library uses the shared centered media heading with the title Exports.
  The shared calendar control remains visible but disabled until Exports owns a
  real mixed-camera date-filter contract; it must not imply that selecting a
  date filters the all-date library before that support exists.
- The heading exposes one localized presentation toggle. List view remains the
  default. Grid view presents the same collection and workflows with a larger
  fixed-aspect thumbnail and its metadata and actions beneath it; switching
  presentation does not reload or duplicate export state.
- Camera facets are derived from the returned exports. Selecting no camera
  means all cameras.
- Ready items show a thumbnail, title, camera, creation date and time, and
  controls for rename, remove, download, and Add to Case.
- Export tiles use the same borderless outer presentation as the other activity
  tiles and the same theme-aware darkened hover surface. When the card's
  thumbnail-hover timelapse setting is enabled, hovering the thumbnail
  temporarily replaces it with a muted accelerated video preview.
  The preview uses a signed WatchZone media path, and the thumbnail viewport has
  fixed row geometry so source aspect ratio cannot resize the tile.
- Selecting a ready tile outside its controls opens the export media dialog.
- Rename is inline module workflow. Remove requires confirmation. Add to Case is
  visible but disabled with a localized coming-soon explanation.
- A successful rename updates the active library collection immediately, so
  both the tile and a subsequently opened media dialog use the authoritative
  name accepted by the backend without waiting for a list reload.
- In-progress exports appear immediately, identify their processing state,
  disable item actions and playback, and refresh until processing completes.
  One frontend export-job owner performs active reconciliation; the library
  controller does not run a competing poll for that same export.
- Frigate 0.17 may retain an accepted export in progress indefinitely. After a
  bounded processing window, WatchZone identifies that provider row as stalled,
  stops polling it, and enables its confirmed Remove action so the user can
  clean up the provider-owned zombie record. Playback, rename, and download
  remain unavailable.
- A Review-initiated export publishes a frontend feature-owned draft before
  the provider mutation returns. The Exports module observes that public job
  contract, presents one draft tile, suppresses a duplicate provider
  in-progress row, and atomically replaces the draft with the completed export.
  Reviews and Exports never import one another.

## Frigate compatibility

- Listing, single-export lookup, and rename use the endpoints shared by Frigate
  0.17 and 0.18.
- Creation delegates to the public `frigate.export_recording` entity action
  registered by the Frigate Home Assistant integration. WatchZone passes the
  originating user context and does not duplicate the integration's export
  request or authentication behavior.
- The Frigate action is asynchronous and does not return an export ID. After it
  completes, the adapter briefly reconciles the provider library and reports
  success only after the newly created, correctly titled export is present.
- Successful creation publishes a provider-neutral library invalidation. An
  active Exports module reloads immediately and retries once for Frigate's
  asynchronous database insertion; a later activation also begins with a fresh
  authoritative load.
- Deletion tries the Frigate 0.18 bulk-delete endpoint first and falls back to
  the 0.17 single-export DELETE endpoint only for endpoint-not-supported
  responses.
- Export thumbnails and videos are resolved only after verifying that the
  export belongs to the requested camera. WatchZone streams them through a
  permission-checked, range-capable Home Assistant HTTP view.
