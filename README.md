# WatchZone

WatchZone is a modular camera interface delivered as one Home Assistant custom
integration. Version `0.0.4-dev.27` provides a responsive, theme-aware Lovelace
card with an accessible name and a retained Home Assistant live view that races
HLS and WebRTC for fast initial video, then prefers WebRTC. Backend camera
providers have not been added yet.

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

## Notification deep links

WatchZone can select a configured camera and open activity media from a Home
Assistant notification tap-action URL. Replace `YOUR_DASHBOARD/YOUR_VIEW` with
the dashboard view containing the WatchZone card.

Camera only:

```text
/YOUR_DASHBOARD/YOUR_VIEW?camera={{camera}}
```

Alert or event clip:

```text
/YOUR_DASHBOARD/YOUR_VIEW?camera={{camera}}&event={{id}}&review={{review_id}}
```

Alert or event snapshot:

```text
/YOUR_DASHBOARD/YOUR_VIEW?camera={{camera}}&event={{id}}&review={{review_id}}&media=snapshot
```

`camera` accepts the configured Home Assistant camera entity ID, its object
ID, its WatchZone title, or the equivalent Frigate camera name. When both
`event` and `review` are supplied, WatchZone tries the explicit event first and
then falls back once to the review. Draft activity remains pending and opens
when its requested clip or snapshot becomes available. This resolution is
independent of the visible Reviews or Events module, so removing either module
from a Stage Design does not disable deep links.

After WatchZone selects the camera or opens the requested media, it removes
only the supported deep-link parameters from the URL and preserves unrelated
query parameters. Normal URL queries and query parameters inside hash-based
Home Assistant routes are supported.

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
