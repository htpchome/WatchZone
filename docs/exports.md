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
- Frigate endpoint and version compatibility belongs only to the Frigate
  provider adapter.
- Reviews may request export preparation and creation through the normalized
  Exports API contract. Reviews does not import or mutate the Exports Stage
  module.

## Library behavior

- A newly activated Exports module requests exports for every camera exposed by
  its configured target camera module and presents one newest-first mixed list.
- Camera facets are derived from the returned exports. Selecting no camera
  means all cameras.
- Ready items show a thumbnail, title, camera, creation date and time, and
  controls for rename, remove, download, and Add to Case.
- Export tiles use the same borderless outer presentation as the other activity
  tiles. When the card's thumbnail-hover timelapse setting is enabled, hovering
  the thumbnail temporarily replaces it with a muted accelerated video preview.
- Selecting a ready tile outside its controls opens the export media dialog.
- Rename is inline module workflow. Remove requires confirmation. Add to Case is
  visible but disabled with a localized coming-soon explanation.
- A successful rename updates the active library collection immediately, so
  both the tile and a subsequently opened media dialog use the authoritative
  name accepted by the backend without waiting for a list reload.
- In-progress exports appear immediately, identify their processing state,
  disable item actions and playback, and refresh until processing completes.

## Frigate compatibility

- Listing, single-export lookup, and rename use the endpoints shared by Frigate
  0.17 and 0.18.
- Creation uses Frigate's recording-range endpoint and the common `source` and
  `name` request fields. The Frigate adapter owns its generated-title format;
  the frontend receives that prepared title without encoding provider rules.
- Deletion tries the Frigate 0.18 bulk-delete endpoint first and falls back to
  the 0.17 single-export DELETE endpoint only for endpoint-not-supported
  responses.
- Export thumbnails and videos are resolved only after verifying that the
  export belongs to the requested camera. WatchZone streams them through a
  permission-checked, range-capable Home Assistant HTTP view.
