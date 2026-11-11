# Recorded Video Viewer Contract

This document is normative for alert, event, snapshot, and hourly recording
viewing. Recording discovery and grouping are governed by
`docs/recordings.md`; this viewer owns playback after a range is selected.

## Ownership

- `frontend/src/features/media-viewer/` is the application-feature boundary.
  Its recorded player owns one ephemeral recorded-media element, transport
  selection, startup, failure fallback, and cleanup. It is not a UI primitive
  or Stage placeable.
- The recorded-video viewer owns viewer lifecycle, notices, and the temporary
  live-audio mute lease. A concrete presentation owns geometry only. Requests
  carry an `event`, `review`, or `recording` presentation identity; selection
  of that presentation is independent of the shared playback engine. The
  current identities may use the same viewport-constrained draggable geometry
  while remaining independently replaceable.
- Recorded-video viewers and presentations are not Stage placeables and do not
  enter the retained live-session pool.
- Live and recorded video share media presentation primitives: overlay
  geometry, control sizing, touch behavior, zoom, fullscreen, and
  Picture-in-Picture boundaries. They do not share a playback/session engine;
  live sessions are retained and recorded sources are finite and ephemeral.
- A future drawer or live-area-cover viewer presentation composes those same
  primitives and recorded player. It does not add a parallel control overlay.
- Providers normalize media URLs into provider-neutral playback sources. UI
  modules and shared tiles do not construct provider-specific URLs.
- Snapshot actions reuse the same draggable viewer shell and render the
  authenticated still image directly. They do not create a video player or
  acquire a temporary live-audio mute lease.

## Playback selection

- Sources identify `file` or `hls` transport and include their content type.
- The provider supplies a preferred transport. Candidates using that transport
  are attempted first while retaining provider order within each group.
- Each candidate is attempted sequentially. WatchZone never races multiple
  recorded transports.
- Native HLS is used when the video element reports support. HLS.js is loaded
  lazily only when native HLS is unavailable.
- Home Assistant-proxied Frigate ranges use a signed media manifest rather
  than a signed multivariant master so native HLS and HLS.js can carry the
  path-scoped signature to media segments without exposing credentials.
- Home Assistant Catalyst may use HLS sources through native playback only. It
  must not load HLS.js or fall back to a direct file source.
- A bounded readiness timeout advances to the next candidate. Final failure is
  reported through the shared toast system, never inline over the media.
- Replacing or closing playback destroys HLS.js, removes the source, and
  releases the browser media element immediately.

## Interaction and audio

- Any non-action area of a playable activity tile opens the recorded-media
  viewer. Download remains independent; snapshot actions open the still image
  in the same viewer shell.
- An alert or detection without an end time is visibly marked as in progress.
  A closed alert also retains that marker while recording playback remains
  unavailable. Its tile remains actionable: activation immediately opens the
  provider-normalized review preview or thumbnail, while the owning activity
  controller performs a short, bounded playback reconciliation in the
  background. Once sources arrive, later activation uses recorded video.
  Failure to obtain a source produces a warning toast rather than a dead
  interaction.
- The recorded video opens with native controls, autoplay requested,
  `playsinline`, and muted audio.
- Recorded media uses the shared bounded display-zoom controller and shared
  browser fullscreen and Picture-in-Picture capability boundaries. Mute,
  fullscreen, and Picture-in-Picture remain fixed overlay controls outside the
  transformed media surface. The PiP path retains the Firefox native-control
  suppression refresh used by live video.
- Recorded media uses the same `MediaPresentationController` interaction
  contract as live video. A touch shows controls and starts their timer, a
  second touch hides them, and zoom or pan hides them. Double-click and
  double-tap perform WatchZone display zoom; the captured double-click default
  prevents the native video element from replacing that action with fullscreen.
- While a recorded-video viewer is open, live WatchZone video in the same
  document is temporarily forced muted through the media-session manager.
- This forced state never changes a camera's explicit mute preference. When the
  final recorded-media container closes, each live presentation recomputes its
  effective mute state from the preserved preference and browser autoplay
  policy.
- Multiple viewers use owner-based mute leases; closing one cannot restore
  live audio while another remains open.
- Recording-hour requests may carry a normalized wall-clock timeline. Only
  those requests render the persistent scrubber below the `16:9` video. Its
  play/pause action is additive: the existing video transport, seek, mute,
  volume, fullscreen, and Picture-in-Picture controls remain intact. Reviews
  and Events do not receive the recording scrubber.

## Recording segment selection

- The recording scrubber remains an ordinary seek control until the user
  explicitly activates segment selection. Activation does not remove or
  replace the existing video transport.
- Segment state, preview bounds, and download orchestration belong to the
  media-viewer feature. The Recordings Stage module does not manage handles or
  construct download URLs.
- Selection starts at the hour boundaries and uses independently operable
  start and end handles. Pointer movement and keyboard arrows adjust to one
  second; Shift+Arrow adjusts by ten seconds. Every handle and current-time
  readout includes seconds.
- The square-ended timeline extends five minutes before and after the loaded
  recording hour while segment selection is active. Handles may select that
  adjacent context; Reset returns them to the original hour boundaries.
- Reset restores the complete hour, Cancel returns to the ordinary scrubber,
  Preview asks the backend for provider-normalized playback sources for the
  selected timestamps, and Download asks for the corresponding authenticated
  path. Export is intentionally outside this contract.
- Segment downloads preserve gaps as provider truth. The backend resolves the
  selected wall-clock range through the owning provider, and unavailable time
  is skipped by that provider rather than synthesized in the browser.

## Draggable modal

- The modal uses a non-modal browser dialog and supports Escape and a labeled
  close control. It does not use the modal top layer because activity tiles
  must remain actionable behind it.
- Only its header initiates pointer dragging. Controls in the header do not.
- The modal is clamped to the viewport while dragging and after viewport
  resize. Its maximum dimensions preserve an on-screen close path.
- The modal initially matches the visible live camera stage dimensions when a
  stage is available, centers on the WatchZone card, and clamps that placement
  to the visible viewport. It provides a diagonal bottom-right, pointer- and
  keyboard-operable resize handle. Resizing is clamped to the visible viewport
  and preserves the header close path.
- The non-blocking dialog has no visual scrim because activity tiles remain
  directly actionable while it is open. An activity-tile activation may
  replace the current media without closing the viewer; any other click outside
  the dialog closes it before the background action runs.
- The player viewport is always `16:9`. Only the diagonal bottom-right resize
  handle changes its dimensions, and width and height remain locked to that
  ratio. The header sits directly above the player; the container owns side and
  bottom padding, while the player owns no modal spacing.
- Recorded and live video render one shared media-control overlay. The
  recorded dialog supplies Picture-in-Picture, fullscreen, and mute in the
  same vertical geometry and sizing as live video; from bottom to top their
  order is mute, fullscreen, Picture-in-Picture.
- Overlay controls use pointer events, shared responsive sizing, touch-focus
  release, and local surface-relative insets. Safe-area insets apply only when
  a presentation actually reaches the physical viewport edge, such as native
  fullscreen.
