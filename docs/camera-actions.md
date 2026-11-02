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

## Authorization

- Subscriptions require read access to the camera entity.
- Suspend and resume require control access and an administrator account.
- Provider errors are normalized at the WebSocket boundary and shown as finite
  error toasts; provider details are not coupled into presentation components.

## Future providers

Add a provider implementation under `providers/<platform>/camera.py` that
implements the normalized camera runtime protocol. Do not branch on provider
names inside the camera module, live presentation, or shared session manager.
