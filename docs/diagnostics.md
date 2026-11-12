# WatchZone Diagnostics Contract and Test Reference

## 1. Purpose

This document defines the diagnostics that remain available in production and
the repeatable procedures used to test live startup. Diagnostics must identify
an owning boundary without becoming routine console noise, leaking credentials,
changing connection behavior, or retaining unbounded history.

The current implementation is a passive live-startup timing recorder. It is
not the future application logging system.

## 2. Runtime and overhead contract

The startup recorder:

- is created only when a media connection attempt already begins;
- records relative timestamps with `performance.now()`;
- performs no network requests, console writes, polling, or persistent storage;
- stores no URLs, offers, answers, ICE candidates, tokens, or provider data;
- keeps only the newest 20 transport-key records; and
- creates snapshots only when explicitly requested.

Leaving the recorder enabled adds a small bounded map and timestamp writes at
existing connection milestones. It must not influence source selection,
timeouts, retries, retention, or playback.

## 3. Reading startup diagnostics

Open the browser developer console and run:

```js
window.wzc?.getLiveStartupTimings();
```

For a compact transport summary, run:

```js
window.wzc
  ?.getLiveStartupTimings()
  .map(
    ({
      key,
      hlsMode,
      signalingPath,
      signalingFallbackReason,
      failureCode,
      reconnectAttempt,
      reconnectDelayMs,
      phases,
    }) => ({
      camera: key,
      hlsMode,
      signalingPath,
      signalingFallbackReason,
      failureCode,
      reconnectAttempt,
      reconnectDelayMs,
      answerMs: phases.answer_received,
      firstFrameMs: phases.first_frame_decoded,
      selectedMs: phases.presentation_selected,
    }),
  );
```

Interpretation:

- `signalingPath: "frigate:trickle_ice"` means the Frigate provider fulfilled
  WebRTC signaling through its authenticated trickle-ICE capability.
- `signalingPath: "home_assistant:standard"` means Home Assistant's generic
  camera signaling contract was used.
- `signalingFallbackReason` is present only when provider preparation failed
  and WatchZone selected standard signaling. Its value is a sanitized code.
- `hlsMode: "low_latency"` means the media playlist advertised LL-HLS partial
  segments and blocking reload, and WatchZone enabled HLS.js low-latency mode.
- `hlsMode: "standard"` means LL-HLS was disabled or not advertised.
- `answerMs` measures WebRTC answer arrival, not decoded video.
- `firstFrameMs` measures the first decodable frame for that transport.
- `selectedMs` measures when that transport first owned presentation.
- `failureCode` is a credential-free category recorded at the owning media
  boundary. Current values distinguish cancellation, unsupported clients,
  configuration or connection timeout, signaling failure, peer failure, ended
  tracks, and otherwise unclassified failures.
- `reconnectAttempt` and `reconnectDelayMs` describe only the latest reconnect
  scheduled for that bounded timing record. They are passive diagnostics and
  do not select or modify retry policy.

## 4. Cold WebRTC startup test

1. Use a fresh page load so no retained media session can satisfy the request.
2. Open a card containing the test camera.
3. Wait until the source label resolves to WebRTC.
4. Run the compact transport summary.
5. Record `signalingPath`, `answerMs`, `firstFrameMs`, browser/app, network
   path, and whether this was a cold or retained session.

Compare results only on the same camera, Home Assistant instance, client,
network path, and cold/retained conditions.

## 5. LL-HLS fallback test

1. Enable **Low-Latency HLS** in the card editor. It is enabled by default.
2. Use a client/network condition already known to be unable to receive the
   WebRTC media path; do not reconfigure Frigate merely to manufacture failure.
3. Start from a fresh page load and wait for HLS presentation.
4. Run the compact transport summary.
5. Confirm the HLS entry reports `hlsMode: "low_latency"` and record
   `stream_url_received`, `hls_manifest_loaded`, `first_frame_decoded`, and
   `presentation_selected` from its `phases` object.
6. Disable **Low-Latency HLS**, repeat under the same conditions, and confirm
   `hlsMode: "standard"` for an A/B startup comparison.

If `hlsMode` is `standard` while the toggle is enabled, inspect Home
Assistant's `stream` configuration, proxy HTTP version, and client capability.
WatchZone must not claim LL-HLS unless the returned playlist proves it.

## 6. Security and sharing

Share the compact timing output, not complete Home Assistant entity states,
WebSocket frames, manifests, or network URLs. Camera state attributes and
network traces can contain access tokens, signed paths, internal hostnames, or
credentials. Diagnostics added later must remain allowlisted and redacted at
their owning boundary.

Backend HLS pre-warming has a separate, repeatable A/B procedure in
`docs/hls-prewarming.md`. The service retains only a bounded state category for
each selected entity (`pending`, `warming`, `warm`, or `failed`); it adds no
polling, timing loop, URL capture, or browser console output.

## 7. Automated validation

Run the focused HLS and diagnostics tests from `frontend/`:

```sh
corepack yarn vitest run \
  tests/home-assistant-connection.test.ts \
  tests/home-assistant-hls-connection.test.ts \
  tests/live-startup-timing.test.ts
```

Before handing off a media change, run the complete frontend and browser
validation required by `AGENTS.md`:

```sh
corepack yarn format
corepack yarn lint
corepack yarn typecheck
corepack yarn test
corepack yarn build
corepack yarn test:browser
```

The automated tests prove URL selection, mode isolation, bounded history, and
browser lifecycle behavior with controlled media fakes. They do not prove
physical Safari, Companion, Catalyst, codec, proxy, or camera behavior; record
those results using the procedures above.

## 8. Backend diagnostic logging

WatchZone provides one integration-scoped backend diagnostic log. It is
disabled by default and can be enabled or disabled from the WatchZone
integration options. The enabled preference is stored as config-entry options;
the log records are never persisted and never use Home Assistant's recorder
database.

When disabled, the facility has no event deque and does not intercept Python
log records. Enabling it allocates one bounded buffer and captures sanitized
structured events plus warnings and errors already emitted from the WatchZone
Python package. Disabling it or unloading the integration detaches the Python
handler, clears the buffer, resets its counters, and releases the deque.
Restarting Home Assistant also discards the history.

The server enforces all of these limits:

- at most 200 records;
- an estimated retained-payload ceiling of 192 KiB;
- source and retained message-length limits;
- no more than 100 accepted events per second;
- consecutive duplicate collapsing with a repeat count; and
- eviction of the oldest records before either retention limit is exceeded.

URLs, bearer credentials, JWT-like values, common token and credential fields,
and control characters are redacted before retention. Log snapshots contain
only detached JSON-safe values; callers never receive the live buffer.

Administrators can download the current snapshot through Home Assistant's
native config-entry diagnostics action. A download while logging is disabled
reports the limits and disabled state with an empty record list. Home
Assistant's standard warnings and errors remain independent of this switch so
disabling diagnostic capture cannot hide operational failures.

The frontend does not subscribe to, poll, or retain this backend history.
Future frontend logging remains a separate document-scoped facility. Startup
timings may eventually be included in an exported diagnostic snapshot, but
they remain measurements rather than log messages.
