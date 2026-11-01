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

export interface HomeAssistantConnection {
  subscribeMessage<T>(
    callback: (message: T) => void,
    message: HomeAssistantMessage,
  ): Promise<HomeAssistantUnsubscribe>;
}

export interface HomeAssistant {
  readonly states: Readonly<Record<string, HomeAssistantEntity>>;
  readonly connection: HomeAssistantConnection;
  callWS<T>(message: HomeAssistantMessage): Promise<T>;
  hassUrl(path: string): string;
}

export interface HomeAssistantApi {
  readonly identity: HomeAssistantConnection;
  callWS<T>(message: HomeAssistantMessage): Promise<T>;
  resolveUrl(path: string): string;
  subscribeMessage<T>(
    callback: (message: T) => void,
    message: HomeAssistantMessage,
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
    callWS: (message) => hass.callWS(message),
    resolveUrl: (path) => hass.hassUrl(path),
    subscribeMessage: (callback, message) =>
      hass.connection.subscribeMessage(callback, message),
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
