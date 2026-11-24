# Two-Way Talk Contract

This document defines the first two-way-talk implementation and its ownership
boundaries. It supplements `architecture.md`, which remains authoritative.

## Ownership

- Two-way talk is an independently placeable, lazily loaded frontend component.
  The Stage Designer may choose a compatible module slot and presentation.
- The persistent two-way-talk tile is a document-level application feature,
  not a Stage module, component, slot, or designer-placeable. It becomes
  available automatically after a talk session connects and renders only when
  no connected CameraOptics surface is presenting that session's camera.
- Below the 600px container breakpoint, the standard built-in Full Stage
  presents it in Camera's responsive controls slot. At 600px and wider, that
  Stage variant moves the same stable component node into
  activity-navigation's centered content slot with `standard` presentation.
  The mobile built-in Full Stage and Camera Only retain the Camera controls
  placement at every size, including a physical phone rotated to landscape.
  The selected slot owns placement and collision-free spacing; the component
  renders only its intrinsic one-button or active three-button control surface.
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
- Persistent incoming audio continues to use the camera's live receive peer.
  While the camera presentation is absent, the document talk service holds a
  dedicated lease on that peer and attaches its receive stream to a temporary
  audio element. Incoming media is never requested from or mixed into the
  send-only talk peer.
- The outgoing peer and its restartable camera target are owned by one
  document-scoped talk-session service. Stage controls and the persistent tile
  are presentations of that service; neither retains a disconnected card or
  owns the peer independently.

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

Successful capability discovery is cached for the current Home Assistant
connection and camera identity. Recreated cards reuse that result instead of
waiting on another WebSocket round trip. During a first unresolved probe, the
inactive control occupies its normal layout position in a disabled state. A
retained active session always renders its normal controls immediately and is
never gated on repeated capability discovery.

## Signaling fallback

For an eligible Frigate camera, the backend first resolves the registered
accelerated trickle-ICE provider capability. If that browser peer fails after
using `frigate:trickle_ice`, the provider performs exactly one clean retry via
Home Assistant's standard camera WebRTC contract. The failed peer is fully
closed before retry. The component receives only the final success or failure and
does not contain signaling-path conditions.

## Interaction and audio state

- Every camera and persistent presentation uses the same non-placeable shared
  controls element for ready, connecting, connected, microphone-muted, and
  speaker-muted states. The persistent tile must not duplicate those controls.
- The controls expose exactly two presentations: `standard`, used everywhere
  including the persistent tile, and `overlay`, used only in camera overlay
  placement. Persistent presentation is not a third visual variant.
- The shared controls own their complete internal geometry and styling. Parent
  surfaces may position the control but must not redefine its button sizing,
  spacing, icon sizing, panel surface, or state colors. Moving a `standard`
  control between the camera surface and persistent tile must not change its
  computed layout or appearance. `overlay` keeps the same markup and geometry
  and substitutes only its documented overlay surface and color tokens.
- The shared controls always reserve the connected three-button width. Ready
  state shows only the single muted-microphone button centered inside that
  footprint, preventing layout movement when talk starts or stops.

- In `overlay` presentation, the inactive microphone control follows the
  camera overlay's shared visibility state and hide timer. In `standard`
  presentation it remains visible and does not register with Camera's overlay
  interaction controller.
- Starting talk requests microphone permission and connects with the outgoing
  microphone live. While startup is pending, the same microphone control shows
  progress and cancels the attempt. Active talk controls remain visible.
- A successful talk connection always starts incoming camera audio unmuted,
  regardless of the camera's prior mute preference. The user may still mute or
  unmute while talk is active. Every talk exit path—normal stop, retained-tile
  stop, dismissal, failure, cancellation, background teardown, or camera
  disablement—sets the camera mute preference to muted. The pre-talk mute state
  is deliberately not restored.
- The center control disconnects talk. The small microphone control disables
  only the outgoing audio track and keeps the peer alive.
- On the matching active camera, the center control retains its existing
  behavior: it ends talk and removes document-level persistence. Away from that
  camera, the persistent tile's center control ends the peer but retains the
  camera target as a restart launcher on the current route. The next Home
  Assistant route, dashboard, or camera-selection change dismisses an idle
  launcher; it does not follow the user after talk has ended. Returning to the
  target camera consumes the idle launcher before any later camera switch. The
  tile's close control ends any peer and dismisses the launcher.
- The persistent tile is fixed to the bottom center of Home Assistant's actual
  dashboard panel, above the effective safe area. Its position follows the
  expanded, collapsed, hidden, or modal sidebar layout and route replacement.
  Below 480px it uses visible side and bottom gutters and one compact row. The
  title and camera name are inline, dismiss remains at the left, the camera
  action remains at the right, and talk controls use the true center whenever
  they clear both. When identity needs more room, the controls shift only far
  enough right to clear it and never wrap. At 480px and wider the tile uses a
  bounded width constrained by the available dashboard panel. It does not
  consume dashboard or Stage layout space. It uses the browser top layer when
  available, with a maximum fixed-layer stack fallback, so card, dashboard,
  and sticky Home Assistant surfaces cannot cover it.
- The persistent camera action returns to the dashboard route where talk
  started, selects the session's stable camera entity, and scrolls its matching
  CameraOptics card into view. Once that camera surface is active, the tile hides
  and the ordinary talk controls present the same session.
- The two small active side controls are icon-only surfaces. They remain
  transparent during hover, press, and idle states so they never cover the
  shared soundwave canvas; non-overlay hover changes only the icon color.
- While talk is active, the center microphone uses the connected color. Muting
  the outgoing microphone changes that center surface to CameraOptics's fixed
  detection-warning color. Hover preserves the current connected or muted
  surface instead of replacing it with a neutral hover state.
- The speaker control uses one talk-session mute state across the normal and
  persistent presentations. It updates the same per-camera mute preference as
  the camera overlay control, subject to the unconditional unmuted-on-start and
  muted-on-exit rules above. A camera presentation becoming active refreshes
  the stored preference so an inactive controller cannot restore stale
  unmuted state after talk ends.
- Incoming and outgoing meters use Web Audio analyzers while talk is active.
  They never route, mix, record, or upload PCM data.
- Connection success and final failure use the shared bounded toast system.

## Mandatory teardown

Responsive relocation may synchronously disconnect and reconnect the same
stable component node. Cleanup defers through that DOM handoff and preserves
the active peer when the node reconnects. After connection, active-camera
change, component/card removal, editor/layout replacement, CameraOptics internal
navigation, Home Assistant route navigation, and dashboard changes detach the
Stage presentation but preserve the document-owned talk peer. A matching
camera surface reattaches the ordinary controls without creating a new peer.

The talk peer and every acquired microphone track are closed on explicit
surface stop, persistent-tile dismissal, camera disablement on the owning
surface, document visibility loss, freeze, failed negotiation, or
late completion after cancellation. A connection attempt that has not yet
succeeded is cancelled when its initiating surface leaves. Talk is never
retained while the app is backgrounded. Teardown is idempotent and late async
results close themselves. The extra live receive lease and temporary audio
element follow the same teardown and cannot outlive the connected talk peer.

## Validation

Tests must cover opt-in configuration compaction, component composition,
provider fallback, cancellation, camera-switch retention, route and dashboard
retention, persistent-tile dismissal and restart, return navigation,
microphone mute, and media-track cleanup. Browser validation must include
permission denial, backgrounding, live playback continuity, responsive tile
geometry, and both accelerated and standard signaling paths.
