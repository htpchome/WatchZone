# Home Assistant Direct Live Connection

## 1. Scope

This contract governs WatchZone's browser-direct connection to a Home Assistant
`camera` entity. It supplements `architecture.md` and
`docs/live-session-lifecycle.md`; those documents remain authoritative for
module boundaries, retention, and audio intent.

The Home Assistant direct connection supports both Home Assistant's WebRTC
signaling protocol and authenticated HLS stream endpoint. They remain separate
lazy adapters behind one live-resolution policy. MJPEG is not currently a
supported path.

## 2. Original implementation boundary

WatchZone does not copy, subclass, patch, or wrap Advanced Camera Card,
FrigateViewCard, or Home Assistant frontend player implementations. The adapter
is an original implementation against:

- Home Assistant's authenticated frontend WebSocket connection.
- The `camera/webrtc/get_client_config`, `camera/webrtc/offer`, and
  `camera/webrtc/candidate` message contracts.
- Standard browser `RTCPeerConnection`, `MediaStream`, and media-element APIs.

External projects may be studied to understand observable architecture and
performance tradeoffs. Their private classes, patched custom elements, source
structure, and implementation code are not dependencies or templates.

## 3. Performance analysis baseline

The initial design analysis compared these local source baselines:

- Advanced Camera Card commit `d2ce00c4`, especially its mandatory Home
  Assistant element side-loading and its Home Assistant live provider.
- FrigateViewCard's Home Assistant direct mount and retained-media paths.
- Home Assistant frontend's current `ha-camera-stream` and
  `ha-web-rtc-player` implementations.

The relevant observation is architectural, not a benchmark claim. Advanced
Camera Card prepares Home Assistant camera elements early and limits broad card
updates. Home Assistant's generic camera stream can also perform capability,
poster, HLS, and WebRTC work. WatchZone keeps its live UI and concrete adapter
lazy, but starts a pooled prewarm lease as soon as the configured entity and
Home Assistant transport are available. Module loading and the eligible live
connection attempts therefore run in parallel.

No startup-time claim is considered verified until measured on the same camera,
Home Assistant instance, browser, network, and cold/warm cache conditions.

## 4. Connection selection

For the initial Home Assistant direct source, WatchZone uses a hedged startup:

1. WebRTC and HLS begin concurrently; neither waits for the other to fail.
2. The first adapter to decode usable video becomes the initial presentation.
3. WebRTC remains the preferred steady-state transport. If HLS paints first,
   WebRTC continues negotiating in the background and takes over only after it
   has decoded usable video.
4. After a successful WebRTC handoff, the losing HLS lease is discarded. A
   shared HLS session used by another consumer is not closed.
5. If only one path succeeds, it remains selected. An error is shown only when
   both paths fail.

This policy deliberately avoids a preliminary capability request because that
extra serial round trip would delay both candidates. Unsupported paths fail
locally at their adapter boundary. The policy may become capability-informed
later if Home Assistant can expose that information without adding startup
latency.

## 5. WebRTC connection sequence

For a validated camera entity, the adapter:

1. Requests Home Assistant's WebRTC client configuration.
2. Creates one peer connection and one owned media stream.
3. Adds receive-only audio and video transceivers and the requested data
   channel, if any.
4. Creates and installs the local offer.
5. Subscribes to Home Assistant's WebRTC offer exchange.
6. Includes local ICE candidates gathered while installing the offer in the
   initial signaling request, avoiding an extra session/candidate round trip.
   Later candidates are trickled after the session ID arrives.
7. Buffers remote ICE candidates until the remote description exists.
8. Reports the connection live when the first video track arrives.

Connection startup is cancellable and bounded by a timeout. Errors are
translated once into an actionable session error. Closing is idempotent and
unsubscribes signaling, closes the peer connection, and stops owned tracks.

## 6. HLS connection sequence

The HLS adapter:

1. Requests an authenticated URL through Home Assistant's `camera/stream`
   WebSocket command with `format: "hls"`.
2. Resolves the returned relative URL through Home Assistant's URL resolver.
3. Uses native HLS when the media element advertises support, covering Safari,
   iOS, iPadOS, Companion iOS, and Catalyst behavior without browser-name
   branching.
4. Otherwise lazy-loads the light HLS.js engine while fetching the master
   manifest in parallel. When the master has exactly one variant, it passes
   that variant directly to the engine to avoid a redundant manifest request.
5. Reports live only after `loadeddata`, not merely after obtaining a playlist
   URL or parsing a manifest.

The HLS session owns its media element because its MediaSource playback state
is element-bound. Closing destroys the playback engine, cancels in-flight
requests, resets the element, and removes it from presentation.

## 7. Ownership and retention

The adapter owns transport mechanics. The document-scoped media-session manager
owns identity, deduplication, leases, retention, retry, and eviction policy.

The session key is the transport type plus camera entity for this first path.
WebRTC and HLS therefore have independent session identities and cleanup while
still participating in one selection policy. Compatible card and
editor-preview instances in the same document share sessions. Removing a live
element releases its lease and detaches presentation; it does not close a
healthy retained winner.

The initial resource budget retains at most four sessions. A winning WebRTC
session may remain parked for five minutes. An HLS candidate has a shorter
15-second idle window, and an unshared HLS loser is discarded immediately
after WebRTC handoff. Established connections receive at most two automatic
reconnect attempts with exponential backoff and jitter. A manual retry is
immediate and starts a fresh bounded retry sequence.

## 8. Current audio behavior

The initial live view is always muted to satisfy browser autoplay policy safely.
It does not yet expose user mute controls. Future audio work must implement the
preference, forced-mute, audio-focus, persistence, and autoplay rules in
`docs/live-session-lifecycle.md`; it may not infer user intent from this initial
forced-muted presentation.

## 9. Required evolution rules

- Keep the concrete adapter dynamically imported and outside the eager graph.
- Keep Home Assistant API typing in WatchZone's narrow boundary instead of
  passing the entire `hass` object into transport code.
- Keep WebRTC, HLS, future MJPEG, and snapshot behavior in separate concrete
  adapters. Selection and hedged-start policy belong at the resolver/live
  orchestration boundary, never inside an adapter.
- Do not add a serial capability probe to the critical startup path without
  measurements proving it improves time to usable video.
- Preserve the peer connection and media stream when presentation elements are
  recreated or moved.
- Add measured timing diagnostics through the future centralized diagnostic
  system, never through routine console noise and never with credentials. The
  current startup recorder is read with
  `window.watchZone.getLiveStartupTimings()` and records relative milestone
  times without writing per-phase console messages.
