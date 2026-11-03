# Server-side HLS Pre-warming

## Scope and ownership

WatchZone can keep Home Assistant's existing HLS stream worker prepared for an
explicitly selected set of camera entities. This is integration-level shared
backend work. It is not inferred from a currently mounted card, stored in card
YAML, or enabled for every camera in Home Assistant.

The allowlist is configured under **Settings > Devices & services > WatchZone

> Configure**. A maximum of twelve cameras may be selected. This prevents
> special-purpose cameras, such as a printer camera, from consuming resources
> unless the user deliberately opts them in.

For each selected entity, WatchZone:

1. Resolves the existing Home Assistant camera entity.
2. Creates or reuses that entity's single Home Assistant stream worker.
3. Creates or reuses its HLS output provider.
4. Enables runtime keepalive and starts cameras sequentially in configured
   order.

No duplicate Home Assistant camera entity is created. Browsers still request
their own playlists and media bytes through Home Assistant; the prepared
server-side playlist and stream worker are shared.

Pre-warming is independent of frontend selection and retention. It does not
open browser HLS/WebRTC transports, consume a browser decoder, or make every
configured camera an active carousel connection. A selected camera still
acquires its frontend transport immediately; an inactive phone camera may be
closed by frontend network policy while its explicitly allowed server stream
remains prepared.

WatchZone remembers the runtime keepalive value it encountered. Deselecting a
camera or unloading WatchZone restores only a value WatchZone changed. An HLS
output that is already idle is removed; an output with an active consumer is
left intact and returns to Home Assistant's normal idle cleanup.

## Resource implications

Pre-warming trades server CPU, memory, decoder work, and camera/network traffic
for faster HLS startup. The option should contain cameras that benefit from a
prepared fallback, not every camera merely because it exists. The future
Python layout designer may expose the same explicit policy beside camera
selection, but it must continue to use this one integration-owned allowlist and
lifecycle.

## Prototype test procedure

1. Select one camera under WatchZone's **Configure** flow.
2. Allow enough time for that camera to produce HLS segments.
3. Open a fresh browser document so no retained frontend session can satisfy
   the test.
4. Use a client or network path already known to fall back to HLS.
5. Run the compact timing command in `docs/diagnostics.md` and record
   `stream_url_received`, `hls_manifest_loaded`, `first_frame_decoded`, and
   `presentation_selected`.
6. Deselect the camera, allow Home Assistant's normal idle cleanup to occur,
   and repeat under the same client and network conditions.

Compare multiple runs. This prototype is successful only if cold-client HLS
startup improves without duplicate entities, duplicate HA stream workers, or
unexpected work for unselected cameras.
