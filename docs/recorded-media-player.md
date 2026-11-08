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
- While a recorded-media container is open, live WatchZone video in the same
  document is temporarily forced muted through the media-session manager.
- This forced state never changes a camera's explicit mute preference. When the
  final recorded-media container closes, each live presentation recomputes its
  effective mute state from the preserved preference and browser autoplay
  policy.
- Multiple containers use owner-based mute leases; closing one cannot restore
  live audio while another remains open.

## Draggable modal

- The modal uses the browser dialog/top-layer model and supports Escape and a
  labeled close control.
- Only its header initiates pointer dragging. Controls in the header do not.
- The modal is clamped to the viewport while dragging and after viewport
  resize. Its maximum dimensions preserve an on-screen close path.
