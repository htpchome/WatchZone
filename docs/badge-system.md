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

An explicit product color pin overrides contextual collision resolution. These
pins are intentionally rare and belong in the shared label policy; Northern
Cardinal is pinned to red wherever its object badge is rendered.
The general collision fallback excludes the red family so ordinary object
labels cannot be mistaken for semantic error or Alert badges.

Review classification colors are shared semantics rather than independent
decorations. The Detection badge background resolves to the same warning color
as the detection thumbnail outline, while text and shape continue to distinguish
the badge from the outline. The Alert badge and alert thumbnail outline likewise
resolve to the shared error color. These classification colors use WatchZone's
theme-independent canonical status palette.

When an activity module is scoped to a grouped camera presentation, each review
or event begins with the configured name of the physical camera that produced
it. This camera badge participates in the same ordered palette resolution as
the remaining badges. Single-camera activity omits the redundant camera badge.

Activity tiles keep a fixed block size and never gain height to accommodate
badges. At medium widths the single primary badge lane spans the complete tile
width between the thumbnail and actions. A single list-level layout pass keeps
every badge that fits in that one non-wrapping lane and replaces the remainder
with a localized neutral `+N more` badge whose accessible label and title
retain the collapsed labels. Metadata, zone, and review state never host badge
overflow. One host observer and one animation-frame-coalesced pass serve the
rendered list; tiles do not own individual observers.

Activity badge order is shared by tiles and recorded-media information:
physical camera when applicable, object and identity labels in provider order,
then the activity classification or type. Presentation ordering never mutates
the provider metadata.
