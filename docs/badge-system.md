# Badge System

Badges are shared UI primitives, not feature modules. `ui/badge.ts` owns compact
label presentation; it does not know about cameras, providers, events, or
Frigate. Consumers choose a semantic variant or a stable palette color and may
select filled, filled-outlined, or outlined presentation plus rounded, pill, or
square shape.

All visual defaults flow through `--wzc-badge-*` tokens defined at the Home
Assistant theme boundary. A consumer may override the public badge tokens for a
specific context. For example, the live-source pill uses the media-overlay
surface while keeping visibility and positioning under the camera live
presentation.

`ui/badge-colors.ts` separately owns label-to-palette policy. Known object,
identity, and zone labels have explicit stable assignments. Unknown labels use
a deterministic normalized-label hash, so the same label retains the same
color across cards and future event surfaces. Providers supply labels but do
not choose frontend colors. Text remains mandatory because color is never the
only carrier of meaning.

The stable label color is a preferred color. When multiple badges share one
presentation, the shared color policy resolves the ordered set together and
deterministically moves later badges away from colors or neighboring color
families already present. Semantic badges such as Clip reserve their family
before object and identity labels are assigned. This prevents one tile from
showing duplicate or visually clustered badge colors without moving collision
logic into a feature renderer.
