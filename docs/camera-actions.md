# Camera Actions

This document defines ownership and lifecycle rules for actions initiated by the
camera module. Actions must not be implemented inside a live connection adapter.

## Snapshot

- The live presentation exposes the currently selected, decoded `video` element.
- `live/frame-capture.ts` captures one native-resolution frame and downloads it
  as a JPEG. Controls, labels, and toasts are intentionally excluded.
- The capture helper owns canvas and object-URL cleanup. It reports failures to
  the camera module, which presents them through the shared toast system.
- Snapshot capture does not start, stop, or replace a media session.

## Picture-in-Picture

- `picture-in-picture.ts` exclusively owns browser capability detection,
  native-control suppression, and temporary suppression release for an
  explicit custom PiP action.
- Live presentation owns selection of the active rendered video and derives
  PiP support directly from the video selected for that render. HLS attachment
  and WebRTC takeover therefore expose the same custom PiP action without a
  follow-up lifecycle render or PiP logic in either connection adapter.
- Live and recorded presentations supply descriptors to the same shared media
  control overlay. The overlay owns geometry, minimum touch targets, and input
  behavior; each playback owner handles the typed action intent against its
  own media/session lifecycle.
- Every video is suppressed before it is connected or painted. Video elements
  are not pointer hit targets; the parent media surface owns zoom and pan while
  the controls overlay owns action input. This prevents a transient browser
  video affordance from receiving a click intended for a WatchZone control.
- WebRTC media readiness reapplies suppression through the PiP helper and
  performs one coalesced geometry refresh. This accounts for Firefox creating
  its native PiP toggle after the video is mounted without adding carousel or
  connection-adapter knowledge of browser controls. HLS retains its existing
  pre-attachment suppression path.
- Firefox's browser-native PiP toggle can consume pointer input before page
  content receives it. CSS stacking is therefore not a reliable fallback; if
  Firefox is configured to ignore a site's PiP opt-out, page code cannot
  guarantee that an overlapping author control receives the click.
- Carousel containers do not detect, enable, suppress, or invoke PiP.

## Suspend and resume

Suspension is a provider capability, not a live transport capability:

1. The camera module owns the confirmation dialog and calls the frontend camera
   runtime API through `CameraRuntimeController`.
2. `features/camera_runtime.py` owns commands, optional resume deadlines,
   restart reconciliation, and scheduled retries. It does not own or infer the
   actual suspended state.
3. `providers/<provider>/camera.py` translates the normalized operation into the
   provider's public Home Assistant contract. The Frigate provider currently
   uses `camera.turn_off` and `camera.turn_on`.
4. Live presentation only renders the normalized suspended state. It does not
   import provider code or issue provider commands.

The selected provider is the sole authority for actual suspension state. For a
Frigate-owned entity, the Frigate integration's reported camera state determines
whether the camera is suspended. Other providers must implement their own truth
behind the same normalized contract. Frontend state and persisted WatchZone data
must never override provider truth.

Only an optional UTC resume deadline is persisted. If a provider restart or an
external action resumes the camera before that deadline, WatchZone accepts the
provider state and removes the obsolete timer; it does not re-suspend the
camera. If the provider is temporarily unavailable at the deadline, resume is
retried at a bounded one-minute interval until it succeeds or the integration
unloads.

Suspending discards the frontend media lease. Resuming creates a fresh live
connection rather than attempting to reuse a stream that may be stale.

Every runtime command and provider state change is broadcast to all subscribed
cards. A suspend or resume initiated in one browser therefore updates the
presentation and media lifecycle in every other open browser without a refresh.

The frontend runtime controller observes Home Assistant connection readiness.
Its subscription disables the WebSocket library's automatic resubscribe so
there is exactly one reconnect owner. The controller retains the last provider
snapshot while Home Assistant is unavailable and creates one fresh runtime
subscription when the connection becomes ready. If Home Assistant reports the
connection ready just before WatchZone's WebSocket commands finish registering,
the controller preserves that snapshot and uses one bounded, cancellable retry
schedule. Success, entity changes, disconnect, and element teardown cancel the
schedule. This avoids both duplicate subscriptions and a one-shot retry racing
integration startup. Live
media reconnection and runtime-capability resubscription remain separate; a
media reconnect must not erase or infer suspend support.

Runtime updates are driven by Home Assistant state events. A provider may also
declare a reconciliation interval when its external control surface does not
reliably produce an event for every change. The backend runs at most one monitor
per entity, regardless of the number of cards or browsers, and only while that
entity has subscribers. The Frigate provider uses this fallback so changes made
directly in Frigate are reflected without navigation or refresh.

Every Home Assistant state listener in the runtime service is an explicit
`@callback`. This is a thread-safety boundary: listeners mutate asyncio state or
schedule coroutines and must therefore execute on Home Assistant's event loop,
never through its executor.

## Authorization

- Subscriptions require read access to the camera entity.
- Suspend and resume require control access and an administrator account.
- Provider errors are normalized at the WebSocket boundary and shown as finite
  error toasts; provider details are not coupled into presentation components.

## Future providers

Built-ins and independently installed companion integrations implement the
normalized camera-runtime protocol and register it through
`custom_components.watchzone.extensions`. The feature resolves the capability
from the provider registry; it does not derive a Python module path from an
entity platform. Do not branch on provider names inside the camera module,
live presentation, or shared session manager.
