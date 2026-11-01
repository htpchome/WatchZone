# Home Assistant Direct Live Connection

## 1. Scope

This contract governs WatchZone's browser-direct connection to a Home Assistant
`camera` entity. It supplements `architecture.md` and
`docs/live-session-lifecycle.md`; those documents remain authoritative for
module boundaries, retention, and audio intent.

The first implementation supports Home Assistant's WebRTC signaling protocol.
HLS and MJPEG are separate future adapters or explicit fallback paths. They are
not started speculatively alongside WebRTC.

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
poster, HLS, and WebRTC work. WatchZone instead loads its small live module and
adapter on demand, then begins one direct WebRTC negotiation immediately.

No startup-time claim is considered verified until measured on the same camera,
Home Assistant instance, browser, network, and cold/warm cache conditions.

## 4. Connection sequence

For a validated camera entity, the adapter:

1. Requests Home Assistant's WebRTC client configuration.
2. Creates one peer connection and one owned media stream.
3. Adds receive-only audio and video transceivers and the requested data
   channel, if any.
4. Creates and installs the local offer.
5. Subscribes to Home Assistant's WebRTC offer exchange.
6. Buffers ICE candidates until their session or remote description exists.
7. Reports the connection live when the first video track arrives.

Connection startup is cancellable and bounded by a timeout. Errors are
translated once into an actionable session error. Closing is idempotent and
unsubscribes signaling, closes the peer connection, and stops owned tracks.

## 5. Ownership and retention

The adapter owns transport mechanics. The document-scoped media-session manager
owns identity, deduplication, leases, retention, retry, and eviction policy.

The session key is the connection type plus camera entity for this first path.
All WatchZone card and editor-preview instances in the same document therefore
share one compatible connection. Removing a live element releases its lease and
detaches its video element; it does not close a healthy retained session.

The initial resource budget retains at most four sessions and closes an idle
session after five minutes. Established connections receive at most two
automatic reconnect attempts with exponential backoff and jitter. A manual
retry is immediate and starts a fresh bounded retry sequence.

## 6. Current audio behavior

The initial live view is always muted to satisfy browser autoplay policy safely.
It does not yet expose user mute controls. Future audio work must implement the
preference, forced-mute, audio-focus, persistence, and autoplay rules in
`docs/live-session-lifecycle.md`; it may not infer user intent from this initial
forced-muted presentation.

## 7. Required evolution rules

- Keep the concrete adapter dynamically imported and outside the eager graph.
- Keep Home Assistant API typing in WatchZone's narrow boundary instead of
  passing the entire `hass` object into transport code.
- Do not add HLS, MJPEG, snapshots, capability probes, or fallback races to the
  WebRTC adapter. Add an explicit resolver/fallback boundary when needed.
- Preserve the peer connection and media stream when presentation elements are
  recreated or moved.
- Add measured timing diagnostics through the future centralized diagnostic
  system, never through routine console noise and never with credentials.
