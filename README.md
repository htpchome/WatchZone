# WatchZone

WatchZone is a modular camera interface delivered as one Home Assistant custom
integration. Version `0.0.2` currently provides the installable application
shell: a responsive, theme-aware Lovelace card with a title editor. Camera
providers and media features have not been added yet.

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
   ```

The Python integration registers the bundled card resource. No separate
Lovelace resource is required.

Architecture and contributor invariants are documented in
[`architecture.md`](architecture.md) and [`AGENTS.md`](AGENTS.md).
