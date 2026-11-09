# Recorded Video Viewer Contract

This document is normative for alert, event, snapshot, and recording viewing.

## Ownership

- `frontend/src/ui/recorded-video-viewer/recorded-video-player.ts` owns one
  ephemeral recorded-media element, transport selection, startup, failure
  fallback, and cleanup.
- The recorded-video viewer owns viewer lifecycle, notices, and the temporary
  live-audio mute lease. A concrete presentation owns geometry only. The first
  presentation is a viewport-constrained draggable dialog.
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

## Draggable modal

- The modal uses a non-modal browser dialog and supports Escape and a labeled
  close control. It does not use the modal top layer because activity tiles
  must remain actionable behind it.
- Only its header initiates pointer dragging. Controls in the header do not.
- The modal is clamped to the viewport while dragging and after viewport
  resize. Its maximum dimensions preserve an on-screen close path.
- The modal initially matches the visible live camera stage dimensions when a
  stage is available. It provides a diagonal bottom-right, pointer- and
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
