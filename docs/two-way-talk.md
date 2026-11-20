# Two-Way Talk Contract

This document defines the first two-way-talk implementation and its ownership
boundaries. It supplements `architecture.md`, which remains authoritative.

## Ownership

- Two-way talk is an independently placeable, lazily loaded frontend component.
  The Stage Designer may choose a compatible module slot and presentation.
- Below the 600px container breakpoint, the built-in Full Stage presents it in
  Camera's responsive controls slot. At 600px and wider, the Stage variant
  moves the same stable component node into activity-navigation's centered
  content slot with `standard` presentation. Camera Only retains the controls
  placement at every size. The selected slot owns placement and collision-free
  spacing; the component renders only its intrinsic one-button or active
  three-button control surface.
- The wide Full Stage reserves the complete active-talk width on the
  activity-navigation centerline. The inactive microphone stays centered in
  that reservation, while linked-light controls remain immediately before the
  active pill boundary and do not move when talk expands. Standard presentation preserves the same single-pill active geometry,
  transparent side-button surfaces, and visible soundwave canvas as the overlay
  while using semantic Home Assistant-aware panel, border, and icon colors.
- The component consumes the card-scoped `CameraSessionContext`. It does not import
  the camera module, reach into its shadow tree, or own live playback.
- Provider-neutral talk resolution lives behind `TalkSourceResolver`.
  Provider signaling and microphone transport live under
  `providers/<provider>/talk/` and the backend provider registry.
- The retained camera video/audio peer remains untouched. Talk uses a separate
  send-only microphone peer, so stopping talk never tears down live playback.

## Capability and configuration

Two-way talk is opt-in per camera. For the Home Assistant connection provider,
the editor first uses Home Assistant's resolved `two_way_audio` capability when
that field is available. Home Assistant 2026.9 does not expose that field on
`CameraCapabilities`, so its absence must not be treated as a negative result.
Both WebRTC and positive evidence of a usable audio backchannel are required;
generic WebRTC playback alone is not sufficient.

When the native field is unavailable, an explicit compatibility capability is
used only when the selected HA entity belongs to the installed Frigate
integration. The provider adapter reads go2rtc runtime metadata through the
Frigate integration's current 0.18+ stream route, with its legacy route as a
compatibility fallback. It requires a send-only/send-receive audio producer or
an explicit talkback capability marker. A WebRTC SDP answer by itself is
deliberately not accepted because go2rtc can accept an outgoing audio track
even when the physical camera has no talkback path. Generic HA cameras remain
unavailable until their integration publishes the native capability. YAML
omits the option at its default `false` value.

Future connection providers implement capability discovery and signaling in
their own provider adapter. A future Frigate go2rtc connection may use the
integration API directly; that behavior must not be added to the Home Assistant
provider or the provider-neutral component.

## Signaling fallback

For an eligible Frigate camera, the backend first resolves the registered
accelerated trickle-ICE provider capability. If that browser peer fails after
using `frigate:trickle_ice`, the provider performs exactly one clean retry via
Home Assistant's standard camera WebRTC contract. The failed peer is fully
closed before retry. The component receives only the final success or failure and
does not contain signaling-path conditions.

## Interaction and audio state

- In `overlay` presentation, the inactive microphone control follows the
  camera overlay's shared visibility state and hide timer. In `standard`
  presentation it remains visible and does not register with Camera's overlay
  interaction controller.
- Starting talk requests microphone permission and connects with the outgoing
  microphone live. While startup is pending, the same microphone control shows
  progress and cancels the attempt. Active talk controls remain visible.
- A successful talk connection activates a temporary audible-playback override
  through the existing camera audio manager. It does not replace the user's
  stored mute preference. Ending or failing talk removes only that override and
  restores the current user preference. An explicit mute or unmute while talk
  is active cancels the override and remains authoritative after talk ends.
  Cancellation before connection does not change audio state. Configured
  auto-unmute is an initial default only and never overwrites user intent.
- The center control disconnects talk. The small microphone control disables
  only the outgoing audio track and keeps the peer alive.
- While talk is active, the center microphone uses the connected color. Muting
  the outgoing microphone changes that center surface to WatchZone's fixed
  detection-warning color. Hover preserves the current connected or muted
  surface instead of replacing it with a neutral hover state.
- The speaker control dispatches the active camera's typed mute intent. It uses
  the same user mute preference as the camera overlay control.
- Incoming and outgoing meters use Web Audio analyzers while talk is active.
  They never route, mix, record, or upload PCM data.
- Connection success and final failure use the shared bounded toast system.

## Mandatory teardown

Responsive relocation may synchronously disconnect and reconnect the same
stable component node. Cleanup defers through that DOM handoff and preserves
the active peer when the node reconnects. The talk peer and every acquired microphone track are closed on explicit stop,
active-camera change, camera disablement, component/card removal, editor/layout
replacement, document visibility loss, freeze, page hide, failed negotiation,
or late completion after cancellation. Talk is never retained while the app is
backgrounded. Teardown is idempotent and late async results close themselves.

## Validation

Tests must cover opt-in configuration compaction, component composition, provider
fallback, cancellation, camera-switch teardown, microphone mute, and media
track cleanup. Browser validation must include permission denial, backgrounding,
live playback continuity, and both accelerated and standard signaling paths.
