# Frigate go2rtc Connection Contract

Status: stable WebRTC/MSE connection baseline with an opt-in experimental HLS
fallback and a native-HLS-only Catalyst policy. Continued edge-case testing may
produce narrow fixes, but retention, navigation, mixed-card, two-way-talk, PTZ,
and provider boundaries are accepted in their current form. Future transports
extend this contract without reopening those boundaries.

This document defines the selectable Frigate go2rtc connection provider. It
supplements `architecture.md`, `live-session-lifecycle.md`, `two-way-talk.md`,
and `ptz.md`, which remain authoritative.

## Provider identity and discovery

- `frigate_go2rtc` is a connection provider, not a browser transport and not a
  variation of Home Assistant Direct.
- A configured camera retains its Home Assistant camera entity as its current
  card identity. The backend resolves that entity through its owning Frigate
  entity-registry `config_entry_id`.
- Frigate integration display names are never identifiers. Renaming an
  integration entry must not invalidate card configuration.
- Multiple Frigate integration instances are first-class. The validated source
  descriptor includes the owning integration's Frigate instance ID and its
  go2rtc stream name. Source and retained-session identities also include the
  config-entry identity, so identical stream names on separate instances cannot
  collide.
- Provider URLs, credentials, authenticated clients, and unrestricted source
  parameters never enter card configuration or frontend descriptors.

## Configuration and mixed cards

- Connection selection is per camera. One card may freely mix Home Assistant
  Direct and Frigate go2rtc cameras in any order.
- `home_assistant` is the default and is omitted from compact YAML.
  `frigate_go2rtc` is stored explicitly.
- The editor offers Frigate go2rtc only when the selected entity resolves to a
  usable Frigate integration instance and go2rtc stream.
- Switching connection types never deletes the camera's Home Assistant HLS
  preference, Frigate fallback choice, two-way-talk opt-in, or PTZ opt-in.
  Capability availability may disable a control but does not rewrite user
  intent.
- Active-camera context carries the selected camera's connection identity.
  Talk and PTZ therefore resolve independently as selection moves between
  providers in a mixed card.

## Live transports

- Frigate go2rtc provides WebRTC as its preferred transport and exactly one
  configured fallback. MSE is the stable default; HLS is an explicit
  experimental choice used for focused compatibility testing. MSE and HLS do
  not race one another.
- A positively identified Home Assistant Mac Catalyst client is the narrow
  exception: its Frigate connection resolves to an HLS-only policy before
  acquisition, so neither WebRTC nor MSE starts. This runtime constraint does
  not rewrite the user's saved fallback choice. Other browser and Companion
  identities retain the configured WebRTC-plus-fallback policy.
- WebRTC signaling uses the explicit `frigate_go2rtc` backend capability. A
  failure does not silently fall through to Home Assistant Direct.
- MSE uses the installed Frigate integration's instance-qualified authenticated
  go2rtc WebSocket proxy. The frontend requests a short-lived Home Assistant
  signed path and supplies only the backend-validated stream name.
- WatchZone Python brokers authorization and source identity but does not proxy
  MSE media bytes.
- The MSE adapter bounds buffered history and corrects drift toward the live
  edge. It owns its MediaSource, SourceBuffer, WebSocket, object URL, video
  element, cancellation, and complete cleanup.
- Frigate HLS first validates Home Assistant camera read permission and the
  owning Frigate config entry and stream. The backend then asks Home
  Assistant's shared stream worker to expose HLS from that Frigate camera's
  go2rtc RTSP source. This supplies a complete authenticated playlist and
  segment chain without exposing Frigate credentials, assuming direct access
  to go2rtc port 1984, or creating an unrestricted proxy.
- Frigate HLS reuses the transport-neutral HLS playback adapter, including
  native-HLS selection, HLS.js selection, live-edge correction, cancellation,
  and cleanup. Catalyst therefore remains on native HLS.

## Retention and navigation

- All Frigate transports use the document-scoped media-session manager and the
  same standard and reduced-bandwidth policies as Home Assistant Direct.
- The retention budget remains keyed by logical camera. Provider and transport
  remain part of the concrete session key.
- Camera selection, carousel movement, card navigation, dashboard navigation,
  editor transitions, and return navigation reuse healthy retained sessions.
- The validated Frigate source descriptor is reused for the Home Assistant
  document lifetime so card reconstruction can synchronously reclaim a healthy
  retained MSE or WebRTC session without presenting a false connecting state.
- Changing a camera's configured connection provider discards that camera's
  unused sessions from the former provider rather than accumulating both
  providers' preferred and fallback transports.

## Two-way talk and PTZ

- Frigate talk capability discovery and its send-only microphone peer live
  under the Frigate provider. They do not add Frigate conditions to the Home
  Assistant talk adapter or the presentation component.
- Frigate PTZ capability discovery uses the owning integration's runtime PTZ
  information. Motion uses the Frigate integration's registered PTZ service
  through the existing subscription-owned WatchZone safety lifecycle.
- Talk and PTZ configuration remains per camera and follows the active camera's
  selected provider in mixed cards.

## Validation

Tests must cover multiple Frigate instances with identical stream names,
mixed-provider cards, configuration switching without lost intent, provider
specific capability resolution, WebRTC-to-MSE fallback, WebRTC-to-HLS
fallback, the absence of an MSE/HLS race, retained navigation, MSE and HLS
cleanup and live-edge correction, talk teardown, PTZ stop ownership, and
unchanged Home Assistant Direct behavior.
