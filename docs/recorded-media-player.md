# Recorded Video Viewer Contract

This document is normative for alert, event, snapshot, and hourly recording
viewing. Recording discovery and grouping are governed by
`docs/recordings.md`; this viewer owns playback after a range is selected.

## Ownership

- `frontend/src/features/media-viewer/` is the application-feature boundary.
  Its recorded player owns one ephemeral recorded-media element, transport
  selection, startup, failure fallback, and cleanup. It is not a UI primitive
  or Stage placeable.
- Shared viewer lifecycle, playback, content, actions, and information remain
  at that feature root. `draggable/` and `bottom-drawer/` are peer concrete
  presentation-shell boundaries. A disabled future editor choice does not
  justify a placeholder source folder or implementation.
- The recorded-video viewer owns viewer lifecycle, notices, and the temporary
  live-audio mute lease. Shared dialog content owns the header, media,
  information, notices, and footer actions. A concrete presentation shell owns
  geometry and its associated interaction lifecycle only. Requests carry an
  `event`, `export`, `review`, or `recording` presentation identity; selection
  of that identity is independent of the configured draggable or bottom-drawer
  shell and of the shared playback engine.
- Recorded-video viewers and presentations are not Stage placeables and do not
  enter the retained live-session pool.
- Live and recorded video share media presentation primitives: overlay
  geometry, control sizing, touch behavior, zoom, fullscreen, and
  Picture-in-Picture boundaries. They do not share a playback/session engine;
  live sessions are retained and recorded sources are finite and ephemeral.
- The bottom drawer composes those same primitives and recorded player. It does
  not add a parallel content tree or control overlay.
- Normalized activity requests may carry presentation-independent metadata,
  snapshot and Review variants, downloads, and a short-lived typed Review
  export intent. Each concrete presentation decides where to place the shared
  information component; the draggable dialog places it beneath the media.
- Providers normalize media URLs into provider-neutral playback sources. UI
  modules and shared tiles do not construct provider-specific URLs.
- Snapshot actions reuse the configured viewer shell and render the
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
- Completed Review and Event video requests use the full-frame provider
  snapshot as their initial poster, falling back to the focused thumbnail only
  when no snapshot exists. Activity tiles retain their focused thumbnails.
- Replacing or closing playback destroys HLS.js, removes the source, and
  releases the browser media element immediately.

## Interaction and audio

- Any non-action area of a playable activity tile opens the recorded-media
  viewer. Download remains independent; snapshot actions open the still image
  in the same viewer shell.
- The current information area is a deliberately distinct solid-task surface
  within the glass viewer shell. It presents classification and object badges,
  camera, localized day/date and time, duration, objects, zones, and
  provider-normalized activity confidence. AI-analysis confidence remains
  separate. On narrow containers its metadata reduces from four columns to
  three with tighter panel padding and grid spacing. Supported actions occupy
  a transparent, consistently sized footer beneath the solid information
  surface, on the same visual row as the dialog-owned resize handle. Footer
  actions use enlarged touch targets and follow the Review tile order: export,
  download, then snapshot or video variant. The metadata surface retains an
  additional logical leading inset so its badges and fields do not visually
  collide with the dialog edge at compact widths.
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
- Recording-hour video exposes one persistent stepped playback-speed control
  in a labeled lower-right footer row beneath the scrubber, with slower and
  faster actions around a compact `ha-dropdown` rate trigger. Its direct-rate
  items use `ha-dropdown-item` and the Home Assistant `wa-select` event
  contract. It does not overlap the video or timeline. Each new media request
  starts at `1×`; the supported
  forward rates are `0.25×`, `0.5×`, `1×`, `2×`, `5×`, `10×`, and `25×`.
  The dropdown permits direct rate changes while the adjacent buttons step
  through the same ordered set. Segment previews retain the current viewer
  rate. When a browser rejects `25×` as a native media rate, WatchZone combines
  the highest supported native step with frame-timed forward advancement to
  preserve the requested effective rate. Reverse playback is excluded because
  browser and HLS implementations do not support it consistently.
- The recording player owns one footer surface behind both the scrubber row
  and playback-speed row. The scrubber remains transparent so translucent
  theme colors are painted once rather than producing a darker stacked band.
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
  explicitly activates segment selection from the dialog footer. The
  recording footer places that action before the full-recording download
  action. Activation does not remove or replace the existing video transport.
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
  path. Export Segment prepares the provider title and opens the shared editable
  export naming dialog for the same selected wall-clock range. Cancel performs
  no mutation; confirmation starts the persistent-export workflow without
  routing through or mutating the Exports Stage module. Result toasts remain
  inside the recorded-media modal.
- While selection is active, its heading and instructions span the complete
  panel width. The selected time summary and action group occupy the row below
  so actions cannot squeeze the explanatory copy into a narrow column.
- Segment downloads preserve gaps as provider truth. The backend resolves the
  selected wall-clock range through the owning provider, and unavailable time
  is skipped by that provider rather than synthesized in the browser.

## Draggable viewer

- The viewer uses a manual popover on a non-modal browser dialog and supports
  Escape and a labeled close control. The popover top layer keeps its
  viewport-relative geometry outside card clipping, transforms, and filtered
  containing blocks while activity tiles remain actionable behind it. Browsers
  without the Popover API retain the non-modal dialog presentation as a
  deterministic fallback.
- Only its header initiates pointer dragging. Controls in the header do not.
- The viewer is clamped to the viewport while dragging and after viewport
  resize. Its maximum dimensions preserve an on-screen close path.
- The viewer initially matches the visible live camera stage dimensions when a
  stage is available while retaining the browser dialog's viewport-relative
  default opening position. It provides a diagonal bottom-right, pointer- and
  keyboard-operable resize handle. The handle's full touch target owns the
  outer dialog corner while its triangular grip artwork is inset so either a
  rounded or square themed corner remains legible. Resizing is clamped to the
  visible viewport and preserves the header close path.
- The non-blocking dialog has no visual scrim because activity tiles remain
  directly actionable while it is open. An activity-tile activation may
  replace the current media without closing the viewer; any other click outside
  the dialog closes it before the background action runs.
- Its shell uses the same Home Assistant native dialog surface, matching
  backdrop filter, radius, and shadow as the AI analysis presentation. The
  media canvas remains independently dark.
- The player viewport is always `16:9`. Only the diagonal bottom-right resize
  handle changes its dimensions, and width and height remain locked to that
  ratio. The header sits directly above the player; the container owns side and
  bottom padding, while the player owns no viewer spacing.
- Recorded and live video render one shared media-control overlay. The
  recorded dialog supplies Picture-in-Picture, fullscreen, and mute in the
  same vertical geometry and sizing as live video; from bottom to top their
  order is mute, fullscreen, Picture-in-Picture.
- Overlay controls use pointer events, shared responsive sizing, touch-focus
  release, and local surface-relative insets. Safe-area insets apply only when
  a presentation actually reaches the physical viewport edge, such as native
  fullscreen.

## Bottom-drawer viewer

- `recorded_media_player_type: bottom_drawer` selects one shared drawer for
  Review, Event, Recording, Export, and snapshot requests. The default
  `draggable` value preserves the draggable presentation on non-phone clients.
  Physical phones always resolve recorded media to the bottom drawer regardless
  of the stored editor choice.
- The drawer is a WatchZone-owned manual popover on a non-modal browser dialog,
  with a non-modal dialog fallback where the Popover API is unavailable. It has
  no scrim, does not light-dismiss, and does not prevent interaction with Home
  Assistant navigation or other content outside WatchZone. Escape does not
  dismiss the drawer.
- The drawer enters from the physical bottom edge through the shared Motion
  boundary. It is horizontally centered on the owning card and uses the greater
  of the card's inline size or `768px`, then clamps to the visible viewport so a
  physical phone is never forced wider than its viewport.
- The header and pull handle remain fixed. The content region grows up to the
  safe visible viewport top, opens at 82% of the visible viewport height, and
  owns any required vertical scrolling. The drawer shell is not resizable.
- Video requests provide a separate pull-down media handle. It expands the
  recorded player from its default `16:9` height up to a square height while
  keeping the width fixed; excess source media is center-cropped through the
  recorded player's existing display-zoom boundary. Pointer, keyboard, and
  double-activation reset behavior remain owned by the bottom-drawer shell.
- The localized top-left close control and a downward drag beginning on the
  pull handle are the only dismissal paths. Releasing before the bounded close
  threshold settles the drawer back open; crossing it animates the drawer out
  and closes it. Gesture and animation ownership ends when the shell
  disconnects.
