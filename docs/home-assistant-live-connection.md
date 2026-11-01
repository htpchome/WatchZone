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

For the initial Home Assistant direct source, WatchZone normally uses a hedged
startup:

1. WebRTC and HLS begin concurrently; neither waits for the other to fail.
2. The first adapter to decode usable video becomes the initial presentation.
3. WebRTC remains the preferred steady-state transport. If HLS paints first,
   WebRTC continues negotiating in the background and takes over only after it
   has decoded usable video.
4. After a successful WebRTC handoff, the losing HLS lease is discarded. A
   shared HLS session used by another consumer is not closed.
5. If only one path succeeds, it remains selected. An error is shown only when
   both paths fail.
6. The upper-right connection indicator shows `Connecting…` while candidates
   race, then replaces that content in place with the currently presented
   transport. A later WebRTC takeover changes that same indicator directly
   from HLS to WebRTC without showing a second connecting phase.

This policy deliberately avoids a preliminary capability request because that
extra serial round trip would delay both candidates. Unsupported paths fail
locally at their adapter boundary. The policy may become capability-informed
later if Home Assistant can expose that information without adding startup
latency.

The Home Assistant Catalyst runtime is the explicit exception. The resolver
selects a separate, dynamically imported Catalyst native-HLS adapter with its
own session key; ordinary HLS does not import or execute that adapter. Catalyst
uses one retained native-HLS session and does not start WebRTC or HLS.js
candidates. This preserves the native media element and its audio/window
lifecycle instead of replacing it during a later WebRTC takeover. Catalyst
identity comes only from the centralized client-environment profile.

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
3. For the ordinary capability-selected path, fetches the master manifest and
   checks the retained media element's native HLS capability. Native HLS is
   preferred when advertised so Safari and WebKit-hosted Home Assistant clients
   keep their platform media lifecycle. Other clients lazy-load the light
   HLS.js engine and use its MSE/MMS path.
4. The separate Catalyst adapter bypasses manifest fetching and assigns Home
   Assistant's returned stream URL directly to its required native HLS element.
   It never imports ordinary HLS or loads HLS.js.
5. When the ordinary-path master has exactly one variant, passes that variant
   directly to the selected player to avoid a redundant manifest request.
6. Reports live only after `loadeddata`, not merely after obtaining a playlist
   URL or parsing a manifest.

The HLS session owns its media element because its MediaSource playback state
is element-bound. Closing destroys the playback engine, cancels in-flight
requests, resets the element, and removes it from presentation.

The camera information layer displays the currently presented transport as
`WebRTC`, `HLS · HLS.js`, or `HLS · native`. A transport takeover updates
the same indicator in place without returning to `Connecting…`. Diagnostics
retain the selected HLS path and the time at which each transport became the
presentation winner.

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

The configured phone or tablet/desktop startup policy determines the initial
audio intent unless the document-scoped session manager already holds an
explicit user preference for that camera. The actual selected media element is
created safely muted with autoplay disabled, attached during connection
startup, and then receives the intended `muted` and `defaultMuted` values
before its source and first `play()` request. This ordering is part of the
playback contract: waiting to unmute until after `loadeddata` loses the initial
audible-playback opportunity in WebKit clients.

Catalyst has a stricter native-media exception matching its proven Home
Assistant selected-media lifecycle. Its retained video is created with
`autoplay` enabled, runtime `muted=true`, and `defaultMuted=false`. After the
visible element is attached, selected-media ownership applies the intended
mute state and requests playback on that same element while the Home Assistant
stream request is in flight. The direct native HLS URL is then assigned without
fetching the manifest, replacing the element, or issuing a third request at
source attachment. `loadeddata` makes the second selected-media request without
changing the desired audio state. The generic presentation layer does not add
another playback request when the Catalyst session becomes selected. The
selected-media requests are fire-and-forget and never block the connection from
becoming live, even if Catalyst leaves a `play()` promise pending. The
distinction between runtime
`muted` and `defaultMuted` is intentional and tested: automatic attachment,
background safety, transport handoff, and autoplay recovery alter runtime mute
only. Only an explicit user mute action changes `defaultMuted`; automatic
unmute must not leave Catalyst's retained player classified as default-muted.
If the pre-source audible request is rejected, the Catalyst adapter immediately
plays the same retained element muted, then reapplies the requested audible
state for its one `loadeddata` action. A denial at that source-ready action
leaves video playing muted and preserves the user's desired unmuted state for a
later gesture. Ordinary HLS never imports or executes this sequence.

The presentation retains explicit user preference across HLS/WebRTC handoff
and presentation replacement. An autoplay rejection temporarily forces muted
output without rewriting that preference. A later user gesture can retry the
same retained element. Audio behavior continues to follow the forced-mute,
audio-focus, lifetime, and autoplay rules in
`docs/live-session-lifecycle.md`.

Only a `NotAllowedError` from the selected element is an autoplay-policy
denial. Native HLS can reject overlapping or source-interrupted `play()` calls
with `AbortError`, `NotSupportedError`, or another transient media error while
continuing through autoplay or the next readiness request. Those errors do not
change effective mute state. Likewise, only the document's explicit hidden
state forces background mute; a non-hidden transitional visibility value is
not treated as backgrounding.

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

## 10. Observed client baseline

Physical-client testing of `0.0.4-dev.8` recorded the following initial HLS
playback paths. These remain capability-selected observations except for the
centralized Catalyst host policy documented above.

| Client                   | Initial playback path |
| ------------------------ | --------------------- |
| Catalyst                 | Native HLS (required) |
| Safari                   | HLS.js                |
| Home Assistant Companion | HLS.js                |
| Edge                     | HLS.js                |
| Chrome                   | HLS.js                |

Startup time was acceptable across the tested clients. Exact client, operating
system, and device versions were not recorded, so future media changes still
require the full physical-client validation matrix.

## 11. Presentation fallback layers

The single-camera presentation keeps visual fallback behavior separate from
transport selection. From back to front it renders a theme-aware generic camera
placeholder, the authenticated Home Assistant camera still, and the active live
video. Connection and error states are overlays, so a transport failure does
not replace an available image with an empty surface.

The Home Assistant boundary resolves `entity_picture` first and otherwise uses
the entity's short-lived `access_token` with the camera proxy endpoint. Tokens
must never be logged or persisted. A failed or unavailable still image falls
back locally without delaying HLS or WebRTC startup. WatchZone must not perform
automatic canvas extraction from live video: privacy protections can block it
without a user gesture and produce browser warnings. Future retained-frame work
must use a media-native lifecycle or an explicit user action.
