# Recorded Media Player Contract

This document is normative for alert, event, and recording playback.

## Ownership

- `frontend/src/media/media-player.ts` owns one ephemeral recorded-media
  element, transport selection, startup, failure fallback, and cleanup.
- A media-player container owns presentation only. The first container is a
  viewport-constrained draggable modal; future drawer and live-area-cover
  containers reuse the same player contract.
- Recorded-media players and containers are not Stage placeables and do not
  enter the retained live-session pool.
- Providers normalize media URLs into provider-neutral playback sources. UI
  modules and shared tiles do not construct provider-specific URLs.

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
  viewer. Download and snapshot actions keep their independent behavior.
- The recorded video opens with native controls, autoplay requested,
  `playsinline`, and muted audio.
- Recorded media uses the shared bounded display-zoom controller and shared
  browser fullscreen and Picture-in-Picture capability boundaries. Mute,
  fullscreen, and Picture-in-Picture remain fixed overlay controls outside the
  transformed media surface. The PiP path retains the Firefox native-control
  suppression refresh used by live video.
- While a recorded-media container is open, live WatchZone video in the same
  document is temporarily forced muted through the media-session manager.
- This forced state never changes a camera's explicit mute preference. When the
  final recorded-media container closes, each live presentation recomputes its
  effective mute state from the preserved preference and browser autoplay
  policy.
- Multiple containers use owner-based mute leases; closing one cannot restore
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
- Recorded-media overlay buttons reuse the square live-media control primitive
  without redefining its geometry or interaction styling. The recorded subset
  preserves the live stack order: Picture-in-Picture, fullscreen, then mute
  from top to bottom.
