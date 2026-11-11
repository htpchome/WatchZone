# Reviews Module Contract

## Identity

- Reviews is the Stage module and provider-neutral feature name.
- Alert and Detection remain review classifications supplied by providers;
  they are not separate module identities.
- The Reviews module is independently lazy-loaded and consumes the normalized
  backend Reviews service. It does not import Events or another placeable.

## Reviewed state

- A review tile exposes its reviewed state as a compact labeled control in the
  tile metadata area; it does not obscure the thumbnail. Its visible label
  names the current state while its accessible label names the toggle action.
- Reviewed uses the Home Assistant success semantic; unreviewed uses the Home
  Assistant warning semantic. Both use a short themed outline pill with a
  checkmark; unreviewed adds a plus sign. The visible pill remains compact in
  the standard tile while its touch and keyboard target remains at least 44
  logical pixels.
- Activating the control updates the local review immediately, calls the
  provider-neutral backend mutation, and rolls back with one toast if the
  provider rejects the change.
- Opening a Review video marks an unreviewed item as reviewed through that same
  mutation path. Snapshot viewing does not change review state, and opening an
  already-reviewed video does not issue a redundant mutation.
- The mutation requires camera-control permission. Providers translate the
  WatchZone review ID and desired boolean into their own authenticated API.
- Review filtering and realtime reconciliation consume the same updated item;
  a second tile-local state model is not permitted.

## Presentation

- Reviews shares the activity-list presentation primitive with Events while
  retaining its own loading, filtering, mutation, and playback orchestration.
- The initial standard activity-tile presentation uses one shared grid for
  Reviews and Events: the thumbnail spans both rows, badges occupy the top
  strip, and metadata, optional analysis/export state, and actions occupy
  independent columns below. Optional Review content must not displace the
  metadata column. Future compact presentations change only placement and
  visibility while retaining the same item model and typed intents.
- Reviews and Events group tiles by the Home Assistant-localized civil date.
  Each date heading remains at the top of the list viewport while its tiles
  scroll beneath it; the next heading pushes it away at the group boundary.
- The first visible Reviews batch is fully enriched before publication. Action
  availability must not pop in through a second summary-to-detail tile render
  or remain incomplete when that follow-up request races; older history may
  continue paging after the complete first batch is visible.
- An in-progress Review exposes no export, download, or snapshot actions. Its
  complete applicable action set appears only after the provider marks the
  Review complete.
- Their shared camera-scoped filter retains distinct category headings and
  presents each category's choices as wrapping pills. Native radio semantics
  preserve single selection, while labels and zones remain multi-select
  checkboxes available to keyboard and assistive-technology users.

## Export workflow

- Every Review tile, whether classified as Alert or Detection, exposes an
  Export action. Events and Recordings do not gain this action.
- Reviews owns the confirmation dialog and mutation lifecycle. The shared
  activity-list primitive only renders the optional action and emits a typed
  intent; it does not call the Exports module or a provider.
- Opening the dialog requests the provider-prepared default title for the
  Review's complete media range, including configured pre- and post-capture.
  The title is editable. Cancel performs no mutation. Confirmation closes the
  dialog immediately and starts the provider-neutral export workflow.
- The originating Review tile owns export feedback beneath its generated
  analysis area. Providers with numeric progress use Home Assistant's progress
  bar; Frigate 0.17 exposes only an active state, so it uses a themed status
  bubble with `ha-spinner`. Completion replaces progress with a short-lived,
  themed success or failure bubble.
- Review playback and download are distinct URLs. The download action uses the
  provider-normalized attachment URL and must not navigate to the playback
  resource.

## Generated analysis

- Providers may normalize an optional generated-analysis title, description,
  confidence score, and concerns onto a Review. Provider response shapes do not
  cross the backend boundary.
- Frigate supplies these values from review metadata. They participate in the
  review revision so analysis generated after initial detection replaces the
  existing Review presentation during realtime reconciliation.
- Only Reviews presents generated analysis. A Review with both values displays
  a compact title action with the creation icon; activating it opens a small,
  keyboard-accessible dialog containing the title and description. Reviews
  without complete analysis display no action. Events neither receive nor
  reserve presentation space for review analysis.
- Selecting a camera begins with a cache-bypassed authoritative Reviews query.
  This recovers a draft that began while another camera was active without
  changing the realtime notification path or its fallback reconciliation.
