# Card Configuration Editor Contract

## 1. Status and scope

This document is normative. It governs every Lovelace card configuration
field, editor control, and editor-preview update in WatchZone. Its purpose is
to preserve the editor and preview component trees while a user types. Home
Assistant must not reconstruct the card on every input event.

## 2. Baseline, draft, and saved configuration

The editor keeps three concepts separate:

- **Baseline:** the configuration Home Assistant supplied when the editor
  opened.
- **Draft:** the normalized local configuration currently shown in controls.
- **Saved configuration:** the draft handed to Home Assistant only when the
  user chooses Save.

The first `setConfig` value establishes the baseline. Editing updates the draft
without replacing that baseline. Cancel discards the draft. Save hands the
complete normalized draft to Home Assistant.

## 3. Home Assistant dirty-state integration

The primary editor path requests Home Assistant's `dirtyState` context with a
composed `context-request` event. The editor seeds its stable WatchZone key
with the baseline and updates that same key with each normalized draft.

The editor must not emit `config-changed` for each `input` event. Home
Assistant treats that event as card configuration and may reconstruct the
preview, destroying component identity and eventually expensive live media
state.

Immediately before Home Assistant handles Save, the adapter hands the final
draft to the edit-card dialog. Any dependency on an internal Home Assistant
dialog member is isolated in `editor/dirty-state.ts`, covered by tests, and
reviewed whenever the minimum supported Home Assistant version changes.

For versions without the dirty-state context, a compatibility path may emit
one `config-changed` event on a committed control change. It may not emit that
event for every keystroke and remains isolated in the adapter boundary.

## 4. Soft preview updates

Draft preview is a WatchZone-owned presentation path. It never mutates saved
configuration.

- Text input is coalesced with a short delay.
- A control commit/change event flushes the latest draft immediately.
- Only the editor preview matching the draft baseline accepts the update.
- Existing preview custom-element identity is preserved.
- Leaving the editor clears the preview draft, timers, and listeners.

Future fields may use an appropriate coalescing strategy, but none may use
repeated `config-changed` events as a live-preview mechanism.

## 5. Controls, themes, and responsive layout

- Prefer current Home Assistant controls and interaction conventions. The
  initial text field uses `ha-input`.
- Before adding a control, verify its current name and behavior against the
  supported Home Assistant frontend documentation and source.
- Unsupported Home Assistant internals are isolated behind a small adapter.
- Use Home Assistant semantic theme tokens. WatchZone customization tokens
  begin with `--wzc-` and resolve to Home Assistant tokens by default.
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
5. Save, cancel, and compatibility behavior where applicable.
6. Tests proving typing does not repeatedly emit `config-changed` or replace
   the preview element.
7. Cleanup for listeners, timers, observers, and asynchronous work.

## 7. Authoritative references

- Home Assistant 2026.8 frontend component update and dirty-state guidance:
  <https://developers.home-assistant.io/blog/2026/07/31/frontend-component-updates-2026.8/>
- Home Assistant custom card editor guidance:
  <https://contributors.home-assistant.io/frontend/custom-ui/card-editor/>
- Home Assistant frontend components:
  <https://contributors.home-assistant.io/frontend/architecture/components/>
- Home Assistant theming architecture:
  <https://contributors.home-assistant.io/frontend/architecture/theming/>
