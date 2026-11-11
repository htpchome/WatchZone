# Recordings Module Contract

## Ownership

- Recordings is an independently lazy-loaded Stage module. It does not import
  Reviews, Events, Camera, or another placeable.
- The Python recordings feature resolves a provider capability and returns
  WatchZone-owned recording days and hourly ranges. Provider response shapes
  and URLs do not leak into the module.
- The Frigate adapter owns authenticated summary and segment queries. It
  exposes Home Assistant-authenticated playback and download candidates.
- The shared recorded-media viewer owns playback, controls, dialog geometry,
  temporary live-audio muting, and cleanup. The Recordings module only opens a
  normalized request.

## Hourly presentation

- One row represents one local clock hour containing recording data.
- The row label uses the actual first and last available segment timestamps,
  not an invented full-hour range.
- Duration is the union of available segment intervals in that hour. Overlap
  and duplicate provider rows are counted once, while gaps remain provider
  truth even though the first presentation keeps one row per hour.
- Empty hours are omitted. The active partial hour updates on a bounded timer.
- Rows are newest first and use the Home Assistant-selected locale, clock, and
  time zone.
- Initial loading paints disabled hourly row skeletons with the already-known
  localized clock ranges. Provider duration and availability replace those
  placeholders when the selected-day response arrives.
- The row viewport uses the same bounded internal scrolling contract as the
  Reviews and Events lists. It contains overscroll without expanding the Stage
  and does not reserve a stable scrollbar gutter.

## Calendar and selection

- Recordings shares camera-scoped date selection and its normalized available
  date keys with the Stage calendar. Hour ranges and provider data remain
  private to the module.
- Recording availability is not limited by the Reviews and Events history-days
  preference. The provider reports every retained recording date the server
  exposes; only the selected day's segment query is fetched.
- When Recordings is active, the Stage calendar marks recording-available days,
  remains aligned to the navigation trailing edge, and leaves the activity
  filter visibly disabled. When Reviews or Events is active, the calendar and
  filter retain their activity behavior.
- With no explicit date selection, Recordings displays today. Resetting the
  calendar returns to that default without changing Reviews or Events data.
- The selected-day heading provides previous and next navigation only when the
  provider reports a recording date in that direction. Navigation selects the
  nearest available older or newer date through the shared camera-scoped date
  context; it does not probe empty dates.

## Media and download

- Activating a non-action area of a row opens its hourly range in the shared
  recorded-media viewer.
- Providers return ordered playback candidates and a preferred transport.
  Frigate supplies HLS and MP4 candidates through its authenticated Home
  Assistant proxy.
- Frigate recording HLS starts from the signed media manifest
  (`index.m3u8`), not the multivariant master. The integration validates that
  manifest's short-lived Home Assistant signature for child media segments;
  no Home Assistant or provider credential is embedded in the browser URL.
- The download action remains independent from row playback and uses the
  provider-normalized range URL with a fresh, short-lived Home Assistant path
  signature and an explicit download request.
- Segment selection extends the normalized recording domain without moving
  provider logic into the module. Export jobs and recording-range editing
  remain future capabilities.

## Hour scrubber

- An hourly recording opens with a Recordings-only scrubber beneath the video.
  Reviews and Events retain the ordinary recorded-media transport.
- The normalized hour includes its local clock-hour bounds, ordered continuous
  playable spans, cumulative media offsets, and overlapping alert/detection
  markers. Provider segment and review response shapes do not cross this
  boundary.
- The scrubber always represents the complete clock hour. It labels both hour
  boundaries and every ten-minute division using the Home Assistant locale and
  clock preference. Missing recording spans remain visible as a fixed striped
  gap rather than being collapsed out of the clock scale.
- Player time is mapped through cumulative span offsets so the wall-clock seek
  pointer skips unavailable gaps while the finite recording source remains a
  concatenation of playable media. Seeking into a gap advances to the next
  playable span; an activity marker seeks to its start and begins playback.
- Alert and detection markers are keyboard-focusable and pointer-actionable.
  Hover or focus shows the provider-normalized review thumbnail and localized
  classification/time label. Marker metadata failure does not fail recording
  discovery or playback.
- Scrubber availability, marker, gap, and pointer colors are fixed WatchZone
  product colors exposed through semantic `--wzc-recording-scrubber-*` tokens;
  they do not derive from Home Assistant theme colors.

## Segment manager

- The segment manager is recording-only and must be explicitly activated from
  the scrubber. Before activation the control remains a normal scrubber.
- Selection uses second-precision start and end handles. The current pointer,
  handle accessible values, and manager range all include seconds while the
  underlying ten-minute hour divisions retain their concise labels.
- Square-ended five-minute selectable regions flank the hour. The initial and
  Reset selection remains the original hour, while either handle may extend
  into adjacent retained recording context.
- Preview resolves a provider-normalized source for the complete selected
  range, including adjacent context, and restores the loaded hour when it
  finishes. Reset restores the complete hour and Cancel deactivates selection
  without closing the viewer.
- Download sends only the entity identity and selected wall-clock timestamps
  to the WatchZone WebSocket boundary. Python checks camera read permission and
  duration bounds, resolves the owning provider capability, and returns
  provider-neutral preview sources, preferred transport, filename, and an
  authenticated download path. The frontend never constructs a Frigate URL.
- Selected-segment export is not part of this implementation.
