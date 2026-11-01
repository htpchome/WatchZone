export interface HomeAssistantEntity {
  readonly entity_id: string;
  readonly state: string;
  readonly attributes: Readonly<Record<string, unknown>> & {
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
