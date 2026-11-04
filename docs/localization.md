# Localization

WatchZone follows the current Home Assistant user's locale. Display language is
not inferred from the browser, server host, integration title, or camera name.

## Frontend

- `hass.locale.language` is authoritative; legacy `hass.language` is the fallback.
- Exact regional catalogs are preferred (`en-GB`, `es-419`, `pt-BR`), followed
  by the base language and then English.
- English is bundled with the card. Only the selected non-English catalog is
  lazy-loaded, so localization does not delay camera startup.
- Missing translated keys fall back to English rather than breaking the card.
- Future date, time, and number presentation must use the complete settings in
  `HomeAssistantApi.locale`, including time zone, clock, date, first-weekday,
  and number preferences. Do not infer these from the language code.
- User-visible strings belong in `frontend/src/locales/en.json`; components
  receive the shared localizer through runtime context. Do not create feature-
  local translation loaders.

## Backend

Home Assistant loads `custom_components/watchzone/translations/<locale>.json`
for config and subentry flows. `strings.json` remains the English source. Every
backend locale must preserve the complete English key shape.

## Identity and user-renamable titles

Home Assistant lets users rename the primary integration entry and its
Preloaded Cameras subentry. These are display titles only:

- runtime identity uses the integration domain and config-entry ID;
- subentry identity uses its type, unique ID, and subentry ID;
- behavior, storage, API, and localization lookups must not use display titles;
- reconfiguration must preserve a user's renamed title.

Supported catalogs: Catalan, German, Greek, English, British English, Spanish,
Latin American Spanish, French, Italian, Polish, Portuguese, and Brazilian
Portuguese.
