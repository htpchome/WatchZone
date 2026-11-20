# PTZ Contract

This document defines PTZ capability discovery, presentation, and motion
ownership. It supplements `architecture.md`, which remains authoritative.

## Ownership

- PTZ is an independently placeable, lazily loaded frontend component. The
  Stage Designer places it into a compatible module slot and may style it
  independently.
- The component consumes only `CameraSessionContext` and a provider-neutral
  `PtzSourceResolver`. It does not import the camera module, inspect its shadow
  tree, or own live playback.
- The backend `PtzService` resolves the configured connection provider through
  the extension registry. Provider-specific discovery and commands remain
  beneath `providers/<provider>/ptz`.
- The initial presentation is a directional overlay. The normalized capability
  model already represents pan, tilt, optical zoom, focus, and presets so later
  presentations do not need a replacement contract.

## Home Assistant provider

The Home Assistant provider uses only Home Assistant-owned state, registries,
runtime data, and service calls. It does not call Frigate or another camera
provider API, and it remains usable when Frigate is not installed.

Supported Home Assistant surfaces are discovered in this order:

1. enabled same-device PTZ button entities;
2. the Home Assistant ONVIF PTZ service and the camera entry's loaded ONVIF
   profile capability;
3. for an HA Frigate camera, the installed integration's runtime PTZ feature
   report plus its registered `frigate.ptz` HA service.

The third surface is an optional compatibility path inside the Home Assistant
provider. It does not change the configured connection type or movement path.
A future Frigate go2rtc connection must register its own PTZ provider
adapter and must not add Frigate transport conditions to the component or the Home
Assistant adapter.

Capabilities are conservative. A control is offered only when Home Assistant
positively exposes the corresponding operation. The editor displays the
per-camera PTZ toggle only when directional PTZ is supported. The option
defaults to `false` and is omitted from YAML at its default.

## Interaction and overlay behavior

- Pointer press or keyboard activation starts movement; release stops it.
- The PTZ overlay consumes the camera controller's shared overlay state and
  hide timer. It does not create a second visibility timer.
- Stage placement is supplied by the trailing control group inside the shared
  `lower` area. PTZ renders at its intrinsic size and does not position itself
  against the Stage or consume viewport safe-area insets.
- Collapsed trigger and expanded directional panel share one immutable center.
  Opening and closing animate the panel dimensions symmetrically around that
  center. Only one of those two interactive surfaces is rendered at a time, so
  the collapsed glyph cannot remain beneath the expanded panel. Neither state
  may jump or establish a second positioning origin. The shared center,
  collapsed trigger, and expanded
  panel remain wholly inside Camera's `lower` area and never enter the right
  rail or metadata strip.
- Active movement holds the shared overlay visible. Releasing movement releases
  that hold and returns visibility to the shared timer.
- Touch-created focus is released after every PTZ button activation. An idle
  expanded panel therefore follows the shared overlay timer and becomes fully
  hidden with the other controls; focus cannot leave a center glyph painted.
- The configured open/closed state initializes each active camera. A user's
  open or collapsed choice then persists across transient overlay visibility;
  the shared hide timer never rewrites component state.
- Unsupported axes are not rendered. The initial UI exposes only pan and tilt;
  zoom, focus, and preset presentations are future work against the existing
  normalized capability contract.
- Touch controls have no sticky hover state and suppress platform tap
  highlighting.
- The shared press-interaction controller owns pointer capture, cancellation,
  keyboard press/release, blur/visibility cancellation, and touch-focus
  release. PTZ supplies only movement start/stop intents.

## Motion safety

One WebSocket subscription owns one movement. Closing the subscription is the
stop intent. Motion is stopped on pointer release or cancellation, keyboard
release, active-camera change, component removal, document visibility loss,
window blur, freeze, page hide, WebSocket disconnect, provider error, or
integration unload.

The backend serializes movement per camera and gives each request a generation.
Starting a new request stops the previous request first. Cleanup from a stale
request cannot stop a newer movement. Stop and cleanup are idempotent.

## Validation

Tests must cover capability normalization, provider registration, start/stop
ownership, replacement of active movement, stale cleanup, integration unload,
active-camera change, late subscription completion, configuration compaction,
and independent layout composition. Browser validation must include pointer,
touch, keyboard, backgrounding, navigation, and connection loss.
