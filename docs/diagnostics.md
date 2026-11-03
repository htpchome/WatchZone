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

## 8. Future centralized logging

The future logger will be one document-scoped frontend service and one
integration-scoped backend facility, joined by a common severity and category
model where useful. It will provide:

- debug, informational, warning, and error levels;
- category filtering and opt-in verbose diagnostics;
- secret redaction before storage, transport, or display;
- duplicate suppression and rate limiting;
- bounded in-memory history with explicit export; and
- adapters for user-facing notices without treating every log as a toast.

Feature code will report structured events to that boundary. It will not add
independent console wrappers, global event buses, or per-feature log stores.
Startup timings may be included in an exported diagnostic snapshot, but they
remain measurements rather than log messages.
