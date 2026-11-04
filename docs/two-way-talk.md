# Two-Way Talk Contract

This document defines the first two-way-talk implementation and its ownership
boundaries. It supplements `architecture.md`, which remains authoritative.

## Ownership

- Two-way talk is an independently placeable, lazily loaded frontend module.
  The Stage Designer may eventually choose its placement and presentation.
- The module consumes the card-scoped `CameraSessionContext`. It does not import
  the camera module, reach into its shadow tree, or own live playback.
- Provider-neutral talk resolution lives behind `TalkSourceResolver`.
  Provider signaling and microphone transport live under
  `providers/<provider>/talk/` and the backend provider registry.
- The retained camera video/audio peer remains untouched. Talk uses a separate
  send-only microphone peer, so stopping talk never tears down live playback.

## Capability and configuration

Two-way talk is opt-in per camera. The editor asks the backend whether the
camera exposes a WebRTC path before enabling the control. Capability discovery
does not request microphone permission or start a media connection. YAML omits
the option at its default `false` value.

The initial Home Assistant provider supports camera entities whose public
camera capabilities include WebRTC. Future providers implement the same public
resolver contract rather than adding provider branches to the module.

## Signaling fallback

For an eligible Frigate camera, the backend first resolves the registered
accelerated trickle-ICE provider capability. If that browser peer fails after
using `frigate:trickle_ice`, the provider performs exactly one clean retry via
Home Assistant's standard camera WebRTC contract. The failed peer is fully
closed before retry. The module receives only the final success or failure and
does not contain signaling-path conditions.

## Interaction and audio state

- The inactive microphone control follows the camera overlay's shared
  visibility state and hide timer.
- Starting talk requests microphone permission and connects with the outgoing
  microphone live. Active talk controls remain visible.
- The center control disconnects talk. The small microphone control disables
  only the outgoing audio track and keeps the peer alive.
- The speaker control dispatches the active camera's typed mute intent. It uses
  the same user mute preference as the camera overlay control.
- Incoming and outgoing meters use Web Audio analyzers while talk is active.
  They never route, mix, record, or upload PCM data.
- Connection success and final failure use the shared bounded toast system.

## Mandatory teardown

The talk peer and every acquired microphone track are closed on explicit stop,
active-camera change, camera disablement, module/card removal, editor/layout
replacement, document visibility loss, freeze, page hide, failed negotiation,
or late completion after cancellation. Talk is never retained while the app is
backgrounded. Teardown is idempotent and late async results close themselves.

## Validation

Tests must cover opt-in configuration compaction, module composition, provider
fallback, cancellation, camera-switch teardown, microphone mute, and media
track cleanup. Browser validation must include permission denial, backgrounding,
live playback continuity, and both accelerated and standard signaling paths.
