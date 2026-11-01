# WatchZone

WatchZone is a modular camera interface delivered as one Home Assistant custom
integration. Version `0.0.4-dev.11` provides a responsive, theme-aware Lovelace
card with a title editor and a retained Home Assistant live view that races HLS
and WebRTC for fast initial video, then prefers WebRTC. Backend camera providers
have not been added yet.

## Install for development

1. Run `corepack yarn build` from `frontend/`.
2. Run `bash scripts/package-release.sh` from the repository root.
3. Extract `dist/watchzone.zip` into
   `<config>/custom_components/watchzone`, or install the matching GitHub
   release through HACS as a custom integration repository.
4. Restart Home Assistant.
5. Add **WatchZone** under **Settings → Devices & services**.
6. Add a manual Lovelace card with:

   ```yaml
   type: custom:watchzone-card
   title: WatchZone
   camera_entity: camera.front_door
   ```

The Python integration registers the bundled card resource. No separate
Lovelace resource is required.

## Development update cycle

Installing `0.0.4-dev.1` requires one Home Assistant restart because it changes
the Python-side resource-registration mechanism. After that baseline is active:

- A frontend-only update needs a full browser/app reload, not a Home Assistant
  restart. The stable entry is served without cache headers and its lazy chunks
  are content-hashed.
- A Python integration change still requires a Home Assistant restart.
- The F12 banner identifies the loaded frontend version and commit build. If it
  shows an older version, that client is still running an older document or
  bundle.
- The authoritative runtime value is available as `window.watchZone` in the
  browser console. Its `version`, `build`, and `activeCardVersion` fields show
  the loaded asset and the custom element actually rendering the card.
- If one page prints two WatchZone banners or `activeCardVersion` differs from
  `version`, an older bundle already registered the card in that browser
  document. Clear the Home Assistant site's frontend data once (or use the
  Companion app's frontend-cache reset), then reopen Home Assistant. Custom
  elements cannot be replaced inside an already loaded document.

HACS may still display a restart-required notice because WatchZone is packaged
as an integration; that notice does not make a frontend-only asset replacement
depend on restarting Core.

Architecture and contributor invariants are documented in
[`architecture.md`](architecture.md) and [`AGENTS.md`](AGENTS.md).
