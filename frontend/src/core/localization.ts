import type { ReactiveController, ReactiveControllerHost } from "lit";

import english from "../locales/en.json";

export type TranslationKey = keyof typeof english;
export type TranslationParameters = Readonly<Record<string, string | number>>;
export type LocalizeFunction = (
  key: TranslationKey,
  parameters?: TranslationParameters,
) => string;

type TranslationCatalog = Readonly<Partial<Record<TranslationKey, string>>>;
type LocaleLoader = () => Promise<{ default: TranslationCatalog }>;

const LOADERS: Readonly<Record<string, LocaleLoader>> = {
  ca: () => import("../locales/ca.json"),
  de: () => import("../locales/de.json"),
  el: () => import("../locales/el.json"),
  "en-GB": () => import("../locales/en-GB.json"),
  es: () => import("../locales/es.json"),
  "es-419": () => import("../locales/es-419.json"),
  fr: () => import("../locales/fr.json"),
  it: () => import("../locales/it.json"),
  pl: () => import("../locales/pl.json"),
  pt: () => import("../locales/pt.json"),
  "pt-BR": () => import("../locales/pt-BR.json"),
};

const CATALOGS = new Map<string, TranslationCatalog>([["en", english]]);
const PENDING = new Map<string, Promise<TranslationCatalog>>();

function interpolate(
  value: string,
  parameters?: TranslationParameters,
): string {
  if (!parameters) return value;
  return value.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const replacement = parameters[name];
    return replacement === undefined ? match : String(replacement);
  });
}

function createLocalize(catalog: TranslationCatalog): LocalizeFunction {
  return (key, parameters) =>
    interpolate(catalog[key] ?? english[key], parameters);
}

export const englishLocalize = createLocalize(english);

export function supportedLanguage(language: string | undefined): string {
  const normalized = language?.trim().replaceAll("_", "-");
  if (!normalized) return "en";
  const [base = "en", region] = normalized.split("-");
  const exact = region
    ? `${base.toLowerCase()}-${region.toUpperCase()}`
    : base.toLowerCase();
  if (exact in LOADERS || exact === "en") return exact;
  const baseLanguage = base.toLowerCase();
  return baseLanguage in LOADERS ? baseLanguage : "en";
}

async function loadCatalog(language: string): Promise<TranslationCatalog> {
  const cached = CATALOGS.get(language);
  if (cached) return cached;
  const pending = PENDING.get(language);
  if (pending) return pending;
  const loader = LOADERS[language];
  if (!loader) return english;
  const request = loader()
    .then(({ default: catalog }) => {
      CATALOGS.set(language, catalog);
      return catalog;
    })
    .catch(() => english)
    .finally(() => PENDING.delete(language));
  PENDING.set(language, request);
  return request;
}

/** Loads one HA-selected locale and requests a host update when it is ready. */
export class LocalizationController implements ReactiveController {
  private _catalog: TranslationCatalog = english;
  private _generation = 0;
  private _language = "en";
  private _localize: LocalizeFunction = englishLocalize;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _changed?: () => void,
  ) {
    _host.addController(this);
  }

  public get localize(): LocalizeFunction {
    return this._localize;
  }

  public setLanguage(value: string | undefined): void {
    const language = supportedLanguage(value);
    if (language === this._language) return;
    this._language = language;
    void this._load(language);
  }

  public hostConnected(): void {
    if (this._language !== "en" && this._catalog === english) {
      void this._load(this._language);
    }
  }

  public hostDisconnected(): void {
    this._generation += 1;
  }

  private async _load(language: string): Promise<void> {
    const generation = ++this._generation;
    const cached = CATALOGS.get(language);
    if (cached) {
      this._apply(cached);
      return;
    }
    this._apply(english);
    const catalog = await loadCatalog(language);
    if (generation !== this._generation || language !== this._language) return;
    this._apply(catalog);
  }

  private _apply(catalog: TranslationCatalog): void {
    if (catalog === this._catalog) return;
    this._catalog = catalog;
    this._localize = createLocalize(catalog);
    this._host.requestUpdate();
    this._changed?.();
  }
}
