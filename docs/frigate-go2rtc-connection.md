# Frigate go2rtc Connection

## Scope

This contract governs the explicit per-camera `Frigate go2rtc` connection
source. It is a separate provider implementation, not an option layered into
the Home Assistant direct adapters. Provider-neutral retention, mute intent,
presentation, and component contracts remain shared.

The first implementation supports MSE and WebRTC live playback plus
Frigate-owned two-way talk and PTZ. HLS is not part of this provider yet.

## Identity and multi-instance routing

Three identities remain distinct:

- the Home Assistant Frigate config-entry ID is the stable provider-instance
  and retained-session identity;
- the Frigate integration's resolved instance route ID is used only in its
  authenticated go2rtc proxy URL;
- the Frigate camera name is the go2rtc stream identity.

The route ID is resolved from the exact config entry that owns the selected
camera entity. WatchZone never derives it from the integration display title,
MQTT `topic_prefix`, or a camera label. Multiple Frigate installations may use
the same camera stream name without sharing a browser session or proxy route.

## Live transport policy

The provider starts MSE and WebRTC concurrently. MSE may paint the first usable
frame; WebRTC continues negotiating and takes over only after it decodes a
usable frame. The losing MSE lease is then discarded without affecting another
consumer of the same retained session.

MSE uses the Frigate integration's authenticated per-instance go2rtc WebSocket
proxy. WebRTC signaling uses WatchZone's explicit `frigate` backend provider
and the shared browser peer engine. An explicit Frigate request never falls
back through the Home Assistant direct provider; failure remains inside the
selected source pipeline.

Concrete Frigate adapters are lazy-loaded. The camera module knows only the
configured source and provider-neutral live-session surface.

## Talk and PTZ

Two-way-talk capability, signaling, and PTZ commands are resolved through the
Frigate provider selected by the camera configuration. The portable TWT and PTZ
components continue to consume their provider-neutral resolvers and active
camera context.

PTZ commands target the selected Home Assistant camera entity through the
Frigate integration's registered entity service, which preserves the owning
config entry. Talk uses a separate microphone peer and never replaces or tears
down retained live playback.

## Evolution rules

- Do not add Frigate transport branches to Home Assistant provider files.
- Do not infer instance identity from user-visible names or MQTT topics.
- Do not put provider-specific behavior in the camera, TWT, or PTZ component.
- Mixed Home Assistant and Frigate cameras share lifecycle policy, never
  concrete transport state or session keys.
- Add future Frigate HLS beneath this provider without changing the Home
  Assistant HLS adapter.
