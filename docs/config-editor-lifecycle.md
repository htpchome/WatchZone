# Card Configuration Editor Contract

## 1. Status and scope

This document is normative. It governs every Lovelace card configuration
field, editor control, and editor-preview update in WatchZone. Its purpose is
to preserve the editor and preview component trees while a user types. Home
Assistant must not reconstruct the card on every input event.

## 2. Baseline, draft, and saved configuration

Camera configuration is an ordered list capped by the centralized
`MAX_CAMERAS` value. Adding, editing, removing, or reordering a camera produces
one complete normalized list update and one dirty-state write. Removal requires
confirmation before the draft changes. Per-camera live, audio, and linked-light
options are edited inside that camera's dialog. Camera-module
appearance is edited once under Layout Settings and applies uniformly to the
module rather than individual cameras. YAML output omits default values while
preserving list order and stable entity identity.

The camera dialog is a nested draft transaction. Update remains disabled until
the normalized camera draft is valid and differs from the camera being edited;
Cancel discards the nested draft. Dialog actions use Home Assistant button
components so themes, disabled presentation, focus, and interaction conventions
remain owned by Home Assistant. The dialog close action likewise uses Home
Assistant's icon-button control. Linked-light icons use Home Assistant's icon
selector and participate in the same nested camera draft; they do not write
configuration until the camera draft is committed.

The editor keeps three concepts separate:

- **Baseline:** the configuration Home Assistant supplied when the editor
  opened.
- **Draft:** the normalized local configuration currently shown in controls.
- **Committed dialog configuration:** the draft handed to Home Assistant
  immediately before Save.
- **Saved configuration:** Home Assistant's committed dialog configuration
  persisted only when the user chooses Save.

The first `setConfig` value establishes the baseline. Editing updates the draft
without replacing that baseline. Cancel discards the draft. Save hands the
complete normalized draft to Home Assistant.

## 3. Home Assistant dirty-state integration

The primary editor path requests Home Assistant's `dirtyState` context with a
composed `context-request` event. The editor seeds its stable WatchZone key
with the baseline and updates that same key with each normalized draft. The
first write for the key establishes the baseline. WatchZone only needs the
context's stable writer closure, so it makes a one-time, non-subscribing context
request. It must not subscribe to provider publications unless a future feature
actually reads `isDirty` or `isEffectiveDirty`; write-only subscription creates
unnecessary reentrancy and lifecycle work.

Dirty state is only change tracking. It does not update the edit dialog's card
configuration and cannot by itself make a draft persist.

The editor must not emit `config-changed` for each `input` event. Home
Assistant treats that event as card configuration and may reconstruct the
preview, destroying component identity and eventually expensive live media
state.

Semantic control changes update the dirty-state slice and WatchZone soft
preview without emitting `config-changed`, preserving the preview card and its
live media identity. Immediately before Home Assistant handles Save, the
isolated `HomeAssistantEditorBridge` commits the complete normalized draft to
the active edit dialog. Home Assistant currently exposes no public final-draft
hook for a custom editor that suppresses `config-changed`; therefore the bridge
feature-detects the narrow `_cardConfig` and `_updateDirtyState` boundary. No
other module may depend on those members or the dialog's action structure.

Home Assistant also caps a sections-view editor preview to
`--ha-view-sections-column-max-width`, including while the edit dialog is in
large mode. The same bridge temporarily sets that inherited property to `100%`
on the active WatchZone dialog so the preview can use the available preview
pane. The override belongs to the edit dialog rather than the custom Config
tab: Home Assistant may disconnect that editor when switching to Visibility or
Layout while retaining the same preview. The bridge therefore keeps the width
uniform across every tab and records and restores the prior inline value and
priority when the dialog closes. Re-entering Config reuses the same dialog-
scoped override instead of stacking another one. Failure to find the expected
dialog degrades to Home Assistant's default preview width; it must never affect
card rendering or saved configuration.

If the dirty-state context or Save boundary is unavailable, the compatibility
path emits one public `config-changed` event with the complete draft. Typing may
update WatchZone's soft preview, but it does not repeatedly emit that event.

## 4. Soft preview updates

Draft preview is a WatchZone-owned presentation path. It never mutates saved
configuration.

- Text input is coalesced with a short delay.
- A control commit/change event publishes the latest soft preview immediately.
- Only the editor preview matching the draft baseline accepts the update.
- Existing preview custom-element identity is preserved.
- Leaving the editor clears the preview draft, timers, and listeners.

Future fields may use an appropriate coalescing strategy, but none may use
repeated `config-changed` events as a live-preview mechanism.

Camera grouping is edited atomically with its owning main-camera draft. The
additional-camera selector uses the standard Home Assistant camera-entity
picker and therefore displays every discovered camera. Selecting the main
camera or an entity already configured anywhere in the card produces a visible
validation error and cannot be committed. A valid selection creates the
secondary camera configuration as part of the same atomic draft.

Each physical camera keeps its own optional Camera Name and normal entity-name
fallback. When a main camera owns an additional camera, a separate Group Name
field appears below the main Camera Name and defaults to `Group A/B`, then
`Group C/D`, and so on. The secondary camera remains a full physical record for
media and activity and is represented by a compact, non-sortable editor tile
after the sortable primary/group list. Its edit action opens that physical
camera record. It cannot own PTZ, two-way talk, lights, or another additional
camera; the group uses the main camera's controls and linked lights. Changing
or deleting the group updates both physical records in the same normalized
draft. Group names are sanitized like camera names, must be unique, and must
differ from both member camera names. Both physical records count toward the
twelve-camera limit.

## 5. Controls, themes, and responsive layout

- Prefer current Home Assistant controls and interaction conventions. The
  initial text field uses `ha-input`.
- Before adding a control, verify its current name and behavior against the
  supported Home Assistant frontend documentation and source.
- Unsupported Home Assistant internals are isolated behind a small adapter.
- Use Home Assistant semantic theme tokens. WatchZone customization tokens
  begin with `--wzc-` and resolve to Home Assistant tokens by default.
- The isolated editor lifecycle bridge applies WatchZone's dedicated opaque
  editor-shell surface to Home Assistant's owning card-edit dialog for the
  complete dialog lifetime, including Config, Visibility, and Layout, and
  restores the previous inline surface state when that dialog closes. The
  custom editor itself does not paint a second editor-wide surface. Nested
  configuration and confirmation dialogs use the separate solid task role with
  Home Assistant's dialog radius, elevation, and scrim semantics.
- Do not hardcode application colors, fonts, elevations, or light/dark mode
  assumptions.
- Use logical dimensions and properties, bounded fluid sizing, and container
  responsiveness. Do not assume a viewport, dashboard column count, panel
  mode, input method, or writing direction.

## 6. Required field checklist

Every new card configuration option includes, in the same change:

1. A typed normalized default and validation rule.
2. A Home Assistant-compatible themed control.
3. Draft and dirty-state wiring under the stable editor key.
4. A soft-preview policy that preserves component identity.
5. Draft commit, public fallback, Save, Cancel, and context-republication
   behavior.
6. Tests proving typing does not repeatedly emit `config-changed` or replace
   the preview element.
7. Cleanup for listeners, timers, observers, and asynchronous work.

## 7. Authoritative references

- Home Assistant dirty-state provider and consumer contract:
  <https://github.com/home-assistant/frontend/blob/dev/src/mixins/dirty-state-provider-mixin.ts>
- Home Assistant Lovelace card-edit dialog lifecycle:
  <https://github.com/home-assistant/frontend/blob/dev/src/panels/lovelace/editor/card-editor/hui-dialog-edit-card.ts>
- Home Assistant custom card editor guidance:
  <https://contributors.home-assistant.io/frontend/custom-ui/card-editor/>
- Home Assistant frontend components:
  <https://contributors.home-assistant.io/frontend/architecture/components/>
- Home Assistant theming architecture:
  <https://contributors.home-assistant.io/frontend/architecture/theming/>
