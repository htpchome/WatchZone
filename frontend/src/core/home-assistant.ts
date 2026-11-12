export interface HomeAssistantEntity {
  readonly entity_id: string;
  readonly state: string;
  readonly attributes: Readonly<Record<string, unknown>> & {
    readonly access_token?: string;
    readonly entity_picture?: string;
    readonly friendly_name?: string;
  };
}

export type HomeAssistantMessage = Readonly<Record<string, unknown>> & {
  readonly type: string;
};

export type HomeAssistantUnsubscribe = () => void;
export interface HomeAssistantSubscriptionOptions {
  readonly resubscribe?: boolean;
}
export type HomeAssistantConnectionEvent = "disconnected" | "ready";
export type HomeAssistantConnectionEventListener = (
  connection: HomeAssistantConnection,
  data?: unknown,
) => void;

export interface HomeAssistantConnection {
  readonly connected?: boolean;
  addEventListener?(
    event: HomeAssistantConnectionEvent,
    listener: HomeAssistantConnectionEventListener,
  ): void;
  removeEventListener?(
    event: HomeAssistantConnectionEvent,
    listener: HomeAssistantConnectionEventListener,
  ): void;
  subscribeMessage<T>(
    callback: (message: T) => void,
    message: HomeAssistantMessage,
    options?: HomeAssistantSubscriptionOptions,
  ): Promise<HomeAssistantUnsubscribe>;
}

export interface HomeAssistantLocale {
  readonly language: string;
  readonly date_format?: string;
  readonly first_weekday?: string;
  readonly number_format?: string;
  readonly time_format?: string;
  readonly time_zone?: string;
}

export interface HomeAssistantTheme {
  readonly modes?: {
    readonly dark?: Readonly<Record<string, string>>;
    readonly light?: Readonly<Record<string, string>>;
  };
  readonly [key: string]: unknown;
}

export interface HomeAssistantThemes {
  readonly darkMode: boolean;
  readonly default_dark_theme?: string | null;
  readonly default_theme: string;
  readonly theme: string;
  readonly themes: Readonly<Record<string, HomeAssistantTheme>>;
}

export interface HomeAssistant {
  readonly config?: {
    readonly time_zone?: string;
    readonly version?: string;
  };
  readonly states: Readonly<Record<string, HomeAssistantEntity>>;
  readonly connection: HomeAssistantConnection;
  readonly language?: string;
  readonly locale?: HomeAssistantLocale;
  readonly themes?: HomeAssistantThemes;
  callService<T = unknown>(
    domain: string,
    service: string,
    serviceData?: Readonly<Record<string, unknown>>,
    target?: Readonly<Record<string, unknown>>,
  ): Promise<T>;
  callWS<T>(message: HomeAssistantMessage): Promise<T>;
  hassUrl(path: string): string;
}

export interface HomeAssistantApi {
  readonly identity: HomeAssistantConnection;
  readonly locale?: HomeAssistantLocale;
  callWS<T>(message: HomeAssistantMessage): Promise<T>;
  resolveUrl(path: string): string;
  subscribeMessage<T>(
    callback: (message: T) => void,
    message: HomeAssistantMessage,
    options?: HomeAssistantSubscriptionOptions,
  ): Promise<HomeAssistantUnsubscribe>;
}

export function isHomeAssistant(value: unknown): value is HomeAssistant {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<HomeAssistant>;
  return (
    typeof candidate.callWS === "function" &&
    typeof candidate.hassUrl === "function" &&
    typeof candidate.connection?.subscribeMessage === "function" &&
    typeof candidate.states === "object" &&
    candidate.states !== null
  );
}

export function createHomeAssistantApi(hass: HomeAssistant): HomeAssistantApi {
  return {
    identity: hass.connection,
    locale: homeAssistantLocale(hass),
    callWS: (message) => hass.callWS(message),
    resolveUrl: (path) => hass.hassUrl(path),
    subscribeMessage: (callback, message, options) =>
      hass.connection.subscribeMessage(callback, message, options),
  };
}

export function homeAssistantLocale(hass: HomeAssistant): HomeAssistantLocale {
  const selectedTimeZone = hass.locale?.time_zone;
  return {
    ...hass.locale,
    language: hass.locale?.language ?? hass.language ?? "en",
    time_zone:
      selectedTimeZone === "server" && hass.config?.time_zone
        ? hass.config.time_zone
        : selectedTimeZone,
  };
}

export function cameraImageUrl(
  hass: HomeAssistant | undefined,
  entityId: string | undefined,
): string | undefined {
  if (!hass || !entityId) {
    return undefined;
  }
  const entity = hass.states[entityId];
  if (!entity) {
    return undefined;
  }
  const entityPicture = entity.attributes.entity_picture;
  if (typeof entityPicture === "string" && entityPicture.length > 0) {
    return hass.hassUrl(entityPicture);
  }
  const accessToken = entity.attributes.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return undefined;
  }
  return hass.hassUrl(
    `/api/camera_proxy/${encodeURIComponent(entityId)}?token=${encodeURIComponent(accessToken)}`,
  );
}

/** Prevents camera stills from retrying credentials retired by an HA reconnect. */
export class HomeAssistantCameraImageCredentialGuard {
  private readonly _retiredUrls = new Map<string, string>();

  public retire(
    hass: HomeAssistant | undefined,
    entityIds: readonly string[],
  ): void {
    if (!hass) return;
    for (const entityId of entityIds) {
      const url = cameraImageUrl(hass, entityId);
      if (url) this._retiredUrls.set(entityId, url);
    }
  }

  public sanitize(
    hass: HomeAssistant,
    entityIds: readonly string[],
  ): HomeAssistant {
    const activeIds = new Set(entityIds);
    let states: Record<string, HomeAssistantEntity> | undefined;

    for (const entityId of this._retiredUrls.keys()) {
      if (!activeIds.has(entityId)) this._retiredUrls.delete(entityId);
    }
    for (const entityId of activeIds) {
      const retiredUrl = this._retiredUrls.get(entityId);
      if (!retiredUrl) continue;
      const currentUrl = cameraImageUrl(hass, entityId);
      if (currentUrl && currentUrl !== retiredUrl) {
        this._retiredUrls.delete(entityId);
        continue;
      }
      const entity = hass.states[entityId];
      if (!entity || currentUrl !== retiredUrl) continue;
      states ??= { ...hass.states };
      const attributes = { ...entity.attributes };
      delete attributes.access_token;
      delete attributes.entity_picture;
      states[entityId] = { ...entity, attributes };
    }

    if (!states) return hass;
    return Object.assign(
      Object.create(Object.getPrototypeOf(hass)) as HomeAssistant,
      hass,
      { states },
    );
  }
}
